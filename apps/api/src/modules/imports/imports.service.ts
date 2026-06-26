import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ImportStatus,
  ImportType,
  Prisma,
  ProductStatus,
  ProductUnit,
  TaxCategory,
} from '@qorvex/database';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

type UploadedImportFile = {
  originalname: string;
  buffer: Buffer;
  size: number;
};

type RawImportRow = Record<string, unknown>;

type PreparedProductImportRow = {
  rowNumber: number;
  rawData: Prisma.InputJsonObject;
  categoryName?: string;
  payload: {
    name: string;
    sku?: string;
    barcode?: string;
    imageUrl?: string;
    brand?: string;
    unit?: ProductUnit;
    price: number;
    cost?: number;
    taxCategory?: TaxCategory;
    taxRate?: number;
    stock: number;
    minStock?: number;
    status?: ProductStatus;
    trackInventory?: boolean;
  };
};

type ImportRowErrorInput = {
  rowNumber: number;
  field?: string;
  message: string;
  rawData: Prisma.InputJsonObject;
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  findAll(tenantId: string) {
    return this.prisma.importBatch.findMany({
      where: { tenantId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        errors: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async importProducts(tenantId: string, userId: string, file?: UploadedImportFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Import file is required.');
    }

    const rows = readWorkbookRows(file);
    const preparedRows: PreparedProductImportRow[] = [];
    const rowErrors: ImportRowErrorInput[] = [];

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const normalized = normalizeRow(row);
      const rawData = toJsonObject(row);
      const errorsBeforeRow = rowErrors.length;
      const name = getText(normalized, ['nombre', 'producto', 'name', 'product']);
      const price = getMoney(normalized, ['precio', 'precio venta', 'sale price', 'price']);
      const stock = getInteger(normalized, ['stock', 'existencia', 'inventario', 'cantidad']);
      const cost = getOptionalMoney(normalized, ['costo', 'cost']);
      const minStock = getOptionalInteger(normalized, ['stock minimo', 'min stock', 'minimo']);
      const taxRate = getOptionalTaxRate(normalized, ['itbis', 'tax', 'tax rate', 'impuesto']);

      if (!name) {
        rowErrors.push({
          rowNumber,
          field: 'nombre',
          message: 'El nombre del producto es requerido.',
          rawData,
        });
      }

      if (price === null || price <= 0) {
        rowErrors.push({
          rowNumber,
          field: 'precio',
          message: 'El precio debe ser mayor que cero.',
          rawData,
        });
      }

      if (stock === null || stock < 0) {
        rowErrors.push({
          rowNumber,
          field: 'stock',
          message: 'El stock debe ser un numero entero mayor o igual a cero.',
          rawData,
        });
      }

      if (errorsBeforeRow !== rowErrors.length) {
        continue;
      }

      preparedRows.push({
        rowNumber,
        rawData,
        categoryName: getText(normalized, ['categoria', 'tipo', 'category']),
        payload: {
          name: name!,
          sku: getText(normalized, ['codigo', 'codigo producto', 'sku']),
          barcode: getText(normalized, ['codigo barras', 'codigo de barras', 'barcode']),
          imageUrl: getText(normalized, ['imagen', 'image', 'image url', 'imageurl']),
          brand: getText(normalized, ['marca', 'proveedor', 'brand', 'supplier']),
          unit: getProductUnit(getText(normalized, ['unidad', 'unit'])),
          price: price!,
          cost: cost ?? undefined,
          taxCategory: taxRate === 0 ? TaxCategory.EXEMPT : undefined,
          taxRate: taxRate ?? undefined,
          stock: stock!,
          minStock: minStock ?? undefined,
          status: getProductStatus(getText(normalized, ['estado', 'status'])),
          trackInventory: getOptionalBoolean(normalized, ['control inventario', 'track inventory']),
        },
      });
    }

    let importedRows = 0;
    const categoryCache = new Map<string, string>();

    for (const row of preparedRows) {
      try {
        const categoryId = row.categoryName
          ? await this.resolveCategoryId(tenantId, row.categoryName, categoryCache)
          : undefined;

        await this.productsService.create(tenantId, userId, {
          ...row.payload,
          categoryId,
          minStock: row.payload.minStock ?? 0,
        });
        importedRows += 1;
      } catch (error) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          message: getImportErrorMessage(error),
          rawData: row.rawData,
        });
      }
    }

    const invalidRows = new Set(rowErrors.map((error) => error.rowNumber)).size;
    const validRows = Math.max(rows.length - invalidRows, 0);

    return this.prisma.importBatch.create({
      data: {
        tenantId,
        type: ImportType.PRODUCTS,
        filename: file.originalname || 'productos.xlsx',
        status: importedRows > 0 ? ImportStatus.IMPORTED : ImportStatus.FAILED,
        totalRows: rows.length,
        validRows,
        invalidRows,
        importedRows,
        createdById: userId,
        confirmedAt: importedRows > 0 ? new Date() : undefined,
        errors: {
          create: rowErrors.map((error) => ({
            rowNumber: error.rowNumber,
            field: error.field,
            message: error.message,
            rawData: error.rawData,
          })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        errors: true,
      },
    });
  }

  private async resolveCategoryId(tenantId: string, name: string, cache: Map<string, string>) {
    const normalizedName = name.trim();
    const key = normalizedName.toLowerCase();

    if (cache.has(key)) {
      return cache.get(key);
    }

    const existing = await this.prisma.productCategory.findFirst({
      where: {
        tenantId,
        name: { equals: normalizedName, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }

    const created = await this.prisma.productCategory.create({
      data: {
        tenantId,
        name: normalizedName,
        status: ProductStatus.ACTIVE,
      },
      select: { id: true },
    });

    cache.set(key, created.id);
    return created.id;
  }
}

function readWorkbookRows(file: UploadedImportFile) {
  if (file.size > 10 * 1024 * 1024) {
    throw new BadRequestException('Import file cannot be larger than 10 MB.');
  }

  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new BadRequestException('Import file does not contain sheets.');
  }

  return XLSX.utils.sheet_to_json<RawImportRow>(workbook.Sheets[firstSheetName], {
    defval: '',
  });
}

function normalizeRow(row: RawImportRow) {
  const normalized = new Map<string, unknown>();

  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeHeader(key), value);
  }

  return normalized;
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getText(row: Map<string, unknown>, keys: string[]) {
  for (const key of keys.map(normalizeHeader)) {
    const value = row.get(key);

    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (text) {
      return text;
    }
  }

  return undefined;
}

function getMoney(row: Map<string, unknown>, keys: string[]) {
  const value = getRawValue(row, keys);
  const parsed = parseNumericValue(value);

  return parsed === null ? null : Number(parsed.toFixed(2));
}

function getOptionalMoney(row: Map<string, unknown>, keys: string[]) {
  const value = getRawValue(row, keys);

  if (isBlank(value)) {
    return null;
  }

  return getMoney(row, keys);
}

function getInteger(row: Map<string, unknown>, keys: string[]) {
  const value = getRawValue(row, keys);
  const parsed = parseNumericValue(value);

  if (parsed === null || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function getOptionalInteger(row: Map<string, unknown>, keys: string[]) {
  const value = getRawValue(row, keys);

  if (isBlank(value)) {
    return null;
  }

  return getInteger(row, keys);
}

function getOptionalTaxRate(row: Map<string, unknown>, keys: string[]) {
  const value = getRawValue(row, keys);

  if (isBlank(value)) {
    return null;
  }

  const parsed = parseNumericValue(value);

  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed > 1 ? parsed / 100 : parsed;
}

function getOptionalBoolean(row: Map<string, unknown>, keys: string[]) {
  const value = getRawValue(row, keys);

  if (isBlank(value)) {
    return undefined;
  }

  const text = String(value).trim().toLowerCase();

  if (['si', 'yes', 'true', '1'].includes(text)) {
    return true;
  }

  if (['no', 'false', '0'].includes(text)) {
    return false;
  }

  return undefined;
}

function getRawValue(row: Map<string, unknown>, keys: string[]) {
  for (const key of keys.map(normalizeHeader)) {
    if (row.has(key)) {
      return row.get(key);
    }
  }

  return undefined;
}

function isBlank(value: unknown) {
  return value === undefined || value === null || String(value).trim() === '';
}

function parseNumericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (isBlank(value)) {
    return null;
  }

  const text = String(value)
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!text) {
    return null;
  }

  let normalized = text;

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(normalized)
      ? normalized.replace(/,/g, '')
      : normalized.replace(',', '.');
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function getProductUnit(value?: string) {
  const key = value?.trim().toLowerCase();

  if (!key) {
    return undefined;
  }

  const units: Record<string, ProductUnit> = {
    unidad: ProductUnit.UNIT,
    unit: ProductUnit.UNIT,
    caja: ProductUnit.BOX,
    box: ProductUnit.BOX,
    paquete: ProductUnit.PACK,
    pack: ProductUnit.PACK,
    saco: ProductUnit.BAG,
    bag: ProductUnit.BAG,
    rollo: ProductUnit.ROLL,
    roll: ProductUnit.ROLL,
    metro: ProductUnit.METER,
    meter: ProductUnit.METER,
    pie: ProductUnit.FOOT,
    foot: ProductUnit.FOOT,
    libra: ProductUnit.POUND,
    pound: ProductUnit.POUND,
    galon: ProductUnit.GALLON,
    gallon: ProductUnit.GALLON,
    litro: ProductUnit.LITER,
    liter: ProductUnit.LITER,
    kilogramo: ProductUnit.KILOGRAM,
    kilogram: ProductUnit.KILOGRAM,
    servicio: ProductUnit.SERVICE,
    service: ProductUnit.SERVICE,
  };

  return units[key];
}

function getProductStatus(value?: string) {
  const key = value?.trim().toLowerCase();

  if (!key) {
    return ProductStatus.ACTIVE;
  }

  const statuses: Record<string, ProductStatus> = {
    activo: ProductStatus.ACTIVE,
    active: ProductStatus.ACTIVE,
    inactivo: ProductStatus.INACTIVE,
    inactive: ProductStatus.INACTIVE,
    descontinuado: ProductStatus.DISCONTINUED,
    discontinued: ProductStatus.DISCONTINUED,
  };

  return statuses[key] ?? ProductStatus.ACTIVE;
}

function toJsonObject(row: RawImportRow) {
  const output: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) {
      continue;
    }

    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      output[key] = value as Prisma.InputJsonValue;
    } else {
      output[key] = String(value);
    }
  }

  return output as Prisma.InputJsonObject;
}

function getImportErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'No se pudo importar esta fila.';
}
