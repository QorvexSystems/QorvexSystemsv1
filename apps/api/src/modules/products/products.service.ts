import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarcodeType,
  EmployeeLogAction,
  InventoryMovementType,
  Prisma,
  ProductStatus,
} from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { getBarcodeLookupCandidates, normalizeBarcodeInput } from '../../common/utils/barcode';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(tenantId: string, q?: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId,
        ...(q ? { OR: this.searchConditions(q) } : {}),
      },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  search(tenantId: string, q: string) {
    const query = q.trim();

    if (!query) {
      return [];
    }

    return this.prisma.product.findMany({
      where: {
        tenantId,
        status: ProductStatus.ACTIVE,
        OR: this.searchConditions(query),
      },
      include: {
        category: true,
      },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      take: 25,
    });
  }

  async findByBarcode(tenantId: string, barcode: string) {
    const lookupCandidates = getBarcodeLookupCandidates(barcode);

    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        status: ProductStatus.ACTIVE,
        OR: [{ barcode: { in: lookupCandidates } }, { sku: { in: lookupCandidates } }],
      },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundException('No active product found for barcode.');
    }

    await this.prisma.product.update({
      where: { id: product.id },
      data: {
        barcodeLastScannedAt: new Date(),
      },
    });

    return product;
  }

  async create(tenantId: string, userId: string, dto: CreateProductDto) {
    if (dto.categoryId) {
      await this.ensureCategory(tenantId, dto.categoryId);
    }

    const barcode = dto.barcode ? this.normalizeBarcode(dto.barcode) : undefined;

    if (barcode) {
      await this.ensureUniqueBarcode(tenantId, barcode);
    }

    const stock = dto.stock ?? 0;
    const price = new Prisma.Decimal(dto.price);
    const cost = dto.cost === undefined ? undefined : new Prisma.Decimal(dto.cost);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          tenantId,
          categoryId: dto.categoryId,
          name: dto.name,
          sku: dto.sku,
          barcode,
          barcodeType: dto.barcodeType ?? (barcode ? BarcodeType.CODE128 : undefined),
          generatedBarcode: false,
          description: dto.description,
          imageUrl: dto.imageUrl,
          brand: dto.brand,
          unit: dto.unit,
          price,
          salePrice: price,
          cost,
          margin: cost ? price.sub(cost).div(price).toDecimalPlaces(4) : undefined,
          taxCategory: dto.taxCategory,
          taxRate: dto.taxRate ?? 0.18,
          trackInventory: dto.trackInventory ?? true,
          stock,
          minStock: dto.minStock ?? 0,
          status: dto.status,
        },
        include: {
          category: true,
        },
      });

      if ((dto.trackInventory ?? true) && stock > 0) {
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: created.id,
            type: InventoryMovementType.INITIAL_STOCK,
            quantity: stock,
            previousStock: 0,
            newStock: stock,
            unitCost: cost,
            reason: 'Inventario inicial del producto',
            reference: `PRODUCT-${created.sku ?? created.id}`,
            createdById: userId,
          },
        });
      }

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId,
          action: EmployeeLogAction.ADD_PRODUCT,
          entity: 'Product',
          entityId: created.id,
          metadata: {
            name: created.name,
            sku: created.sku,
            barcode: created.barcode,
          },
        },
      });

      return created;
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: product.id,
      metadata: { name: product.name, sku: product.sku, barcode: product.barcode },
    });

    return product;
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found for tenant.');
    }

    return product;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateProductDto) {
    const currentProduct = await this.findOne(tenantId, id);

    if (dto.categoryId) {
      await this.ensureCategory(tenantId, dto.categoryId);
    }

    const barcode = dto.barcode ? this.normalizeBarcode(dto.barcode) : dto.barcode;

    if (barcode && barcode !== currentProduct.barcode) {
      await this.ensureUniqueBarcode(tenantId, barcode, id);
    }

    const nextPrice =
      dto.price === undefined ? undefined : new Prisma.Decimal(dto.price).toDecimalPlaces(2);
    const nextCost =
      dto.cost === undefined ? undefined : new Prisma.Decimal(dto.cost).toDecimalPlaces(2);
    const shouldTrackInventory = dto.trackInventory ?? currentProduct.trackInventory;
    const shouldCreateStockMovement =
      dto.stock !== undefined && dto.stock !== currentProduct.stock && shouldTrackInventory;

    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          sku: dto.sku,
          barcode,
          barcodeType: dto.barcodeType,
          description: dto.description,
          imageUrl: dto.imageUrl,
          brand: dto.brand,
          unit: dto.unit,
          price: nextPrice,
          salePrice: nextPrice,
          cost: nextCost,
          margin:
            nextPrice && nextCost && !nextPrice.isZero()
              ? nextPrice.sub(nextCost).div(nextPrice).toDecimalPlaces(4)
              : undefined,
          taxCategory: dto.taxCategory,
          taxRate: dto.taxRate,
          trackInventory: dto.trackInventory,
          stock: dto.stock,
          minStock: dto.minStock,
          status: dto.status,
        },
        include: {
          category: true,
        },
      });

      if (shouldCreateStockMovement) {
        const difference = dto.stock! - currentProduct.stock;
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: id,
            type:
              difference >= 0
                ? InventoryMovementType.ADJUSTMENT_IN
                : InventoryMovementType.ADJUSTMENT_OUT,
            quantity: Math.abs(difference),
            previousStock: currentProduct.stock,
            newStock: dto.stock,
            unitCost: nextCost ?? currentProduct.cost,
            reason: 'Ajuste administrativo de stock',
            reference: `PRODUCT-${updated.sku ?? updated.id}`,
            createdById: userId,
          },
        });
      }

      if (barcode && barcode !== currentProduct.barcode) {
        await tx.employeeActivityLog.create({
          data: {
            tenantId,
            userId,
            action: EmployeeLogAction.CHANGE_BARCODE,
            entity: 'Product',
            entityId: id,
            metadata: {
              previousBarcode: currentProduct.barcode,
              barcode,
            },
          },
        });
      }

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId,
          action: EmployeeLogAction.UPDATE_PRODUCT,
          entity: 'Product',
          entityId: id,
          metadata: { fields: Object.keys(dto) },
        },
      });

      return updated;
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return product;
  }

  async generateBarcode(tenantId: string, userId: string, id: string) {
    const product = await this.findOne(tenantId, id);

    if (product.barcode) {
      return product;
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { slug: true },
    });
    const tenantCode = tenant.slug
      .split('-')
      .map((part) => part[0])
      .join('')
      .slice(0, 4)
      .toUpperCase();

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const count = await this.prisma.product.count({ where: { tenantId } });
      const candidate = `QV-${tenantCode}-${String(count + attempt + 1).padStart(6, '0')}`;
      const existing = await this.prisma.product.findFirst({
        where: { tenantId, barcode: candidate },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id },
          data: {
            barcode: candidate,
            barcodeType: BarcodeType.INTERNAL_CODE128,
            generatedBarcode: true,
            barcodeCreatedById: userId,
          },
          include: { category: true },
        });

        await tx.employeeActivityLog.create({
          data: {
            tenantId,
            userId,
            action: EmployeeLogAction.CHANGE_BARCODE,
            entity: 'Product',
            entityId: id,
            metadata: {
              generatedBarcode: candidate,
              productName: product.name,
            },
          },
        });

        return updated;
      });
    }

    throw new ConflictException('Could not generate a unique barcode.');
  }

  async getLabel(tenantId: string, userId: string, id: string) {
    const product = await this.findOne(tenantId, id);

    if (!product.barcode) {
      throw new BadRequestException('Product must have a barcode before printing labels.');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        barcodeLabelPrintedAt: new Date(),
        barcodeLabelPrintCount: {
          increment: 1,
        },
      },
      include: { category: true },
    });

    await this.prisma.employeeActivityLog.create({
      data: {
        tenantId,
        userId,
        action: EmployeeLogAction.PRINT_RECEIPT,
        entity: 'ProductBarcodeLabel',
        entityId: id,
        metadata: {
          barcode: product.barcode,
          productName: product.name,
        },
      },
    });

    return {
      productId: updated.id,
      name: updated.name,
      sku: updated.sku,
      barcode: updated.barcode,
      barcodeType: updated.barcodeType,
      price: updated.salePrice.toNumber() || updated.price.toNumber(),
      printedAt: updated.barcodeLabelPrintedAt,
      printCount: updated.barcodeLabelPrintCount,
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.INACTIVE,
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'PRODUCT_DEACTIVATED',
      entity: 'Product',
      entityId: id,
    });

    await this.prisma.employeeActivityLog.create({
      data: {
        tenantId,
        userId,
        action: EmployeeLogAction.DELETE_PRODUCT,
        entity: 'Product',
        entityId: id,
        metadata: { name: product.name, sku: product.sku },
      },
    });

    return product;
  }

  private searchConditions(query: string): Prisma.ProductWhereInput[] {
    return [
      { name: { contains: query, mode: 'insensitive' } },
      { sku: { contains: query, mode: 'insensitive' } },
      { barcode: { contains: query, mode: 'insensitive' } },
      { brand: { contains: query, mode: 'insensitive' } },
    ];
  }

  private normalizeBarcode(barcode: string) {
    return normalizeBarcodeInput(barcode);
  }

  private async ensureUniqueBarcode(tenantId: string, barcode: string, productId?: string) {
    const existing = await this.prisma.product.findFirst({
      where: {
        tenantId,
        barcode,
        ...(productId ? { id: { not: productId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Barcode already exists for this tenant.');
    }
  }

  private async ensureCategory(tenantId: string, categoryId: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        tenantId,
      },
    });

    if (!category) {
      throw new NotFoundException('Product category not found for tenant.');
    }
  }
}
