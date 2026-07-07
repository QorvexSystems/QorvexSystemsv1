import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  DocumentType,
  ElectronicDocumentProvider,
  ElectronicDocumentStatus,
  EmployeeLogAction,
  EmployeeStatus,
  FiscalSequenceStatus,
  InventoryMovementType,
  InvoiceDocumentType,
  InvoiceFiscalStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Product,
  ProductStatus,
  ProductUnit,
  Role,
  SalesOrderDestination,
  SalesOrderStatus,
} from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { getBarcodeLookupCandidates } from '../../common/utils/barcode';
import { CompleteSaleDto, PosSaleItemDto } from './dto/complete-sale.dto';

const adminRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN];
const claimTtlMs = 30 * 60 * 1000;

type ComputedSaleLine = {
  product: Product;
  productId: string;
  sku: string | null;
  barcode: string | null;
  description: string;
  quantity: Prisma.Decimal;
  reservedQuantity: number;
  unitPrice: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
};

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(tenantId: string, user: AuthenticatedUser, q: string) {
    await this.ensureCanCreateDirectSale(tenantId, user);
    const query = q.trim();

    if (!query) {
      return [];
    }

    return this.prisma.product.findMany({
      where: {
        tenantId,
        status: ProductStatus.ACTIVE,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { category: true },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      take: 30,
    });
  }

  async findByBarcode(tenantId: string, user: AuthenticatedUser, barcode: string) {
    await this.ensureCanCreateDirectSale(tenantId, user);
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
      data: { barcodeLastScannedAt: new Date() },
    });

    return product;
  }

  async previewSale(tenantId: string, user: AuthenticatedUser, dto: CompleteSaleDto) {
    await this.ensureCanCreateDirectSale(tenantId, user);
    const computed = await this.computeSale(tenantId, dto.items ?? []);

    return {
      documentType: dto.documentType ?? InvoiceDocumentType.CONSUMER_ELECTRONIC_32,
      paymentMethod: dto.paymentMethod,
      subtotal: computed.subtotal.toNumber(),
      discountTotal: computed.discountTotal.toNumber(),
      taxTotal: computed.taxTotal.toNumber(),
      total: computed.total.toNumber(),
      items: computed.items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        quantity: item.quantity.toNumber(),
        unitPrice: item.unitPrice.toNumber(),
        discountTotal: item.discountTotal.toNumber(),
        subtotal: item.subtotal.toNumber(),
        taxTotal: item.taxTotal.toNumber(),
        total: item.total.toNumber(),
      })),
    };
  }

  async completeSale(tenantId: string, user: AuthenticatedUser, dto: CompleteSaleDto) {
    const membership = await this.ensureCanUsePos(tenantId, user);

    if (this.isAdminMembership(membership)) {
      throw new ForbiddenException('Admins cannot complete POS sales. Cashiers must charge orders.');
    }

    if (!dto.orderId) {
      throw new ForbiddenException('Direct POS sales are disabled. Load an order to charge.');
    }

    return this.prisma.$transaction(async (tx) => {
      const cashSession = await this.findCashSessionForSale(
        tx,
        tenantId,
        user.id,
        dto.cashSessionId,
      );
      const order = dto.orderId
        ? await this.claimOrderForSale(tx, tenantId, user.id, cashSession.id, dto.orderId)
        : null;

      const computed = order
        ? await this.computeSaleFromOrder(order)
        : await this.computeSale(tenantId, dto.items ?? [], tx);

      if (!computed.items.length) {
        throw new BadRequestException('Sale must include at least one item.');
      }

      const documentType = dto.documentType ?? InvoiceDocumentType.CONSUMER_ELECTRONIC_32;
      const customerId = dto.customerId ?? order?.customerId ?? undefined;
      const customer = customerId
        ? await tx.customer.findFirst({
            where: {
              id: customerId,
              tenantId,
            },
          })
        : null;

      if (customerId && !customer) {
        throw new NotFoundException('Customer not found for tenant.');
      }

      if (
        documentType === InvoiceDocumentType.FISCAL_CREDIT_ELECTRONIC_31 &&
        (!customer ||
          customer.documentType !== DocumentType.RNC ||
          !customer.documentNumber?.trim())
      ) {
        throw new BadRequestException('Fiscal credit invoices require an RNC customer.');
      }

      const sequence = await this.reserveFiscalSequence(tx, tenantId, documentType);
      const payment = this.getPaymentAmounts(dto.amountReceived, computed.total, dto.paymentMethod);
      const paidAmount = payment.paidAmount;
      const balance = computed.total.sub(paidAmount).toDecimalPlaces(2);
      const status = this.getInvoiceStatus(paidAmount, computed.total);
      const issuedAt = new Date();
      const fiscalNumber = this.formatFiscalNumber(sequence.prefix, sequence.number);
      const invoiceNumber = `RIV-${fiscalNumber}`;
      const eNcf = fiscalNumber;

      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          customerId: customer?.id,
          documentType,
          invoiceNumber,
          ncf: fiscalNumber,
          eNcf,
          status,
          fiscalStatus: InvoiceFiscalStatus.SIGNED,
          subtotal: computed.subtotal,
          taxTotal: computed.taxTotal,
          discountTotal: computed.discountTotal,
          total: computed.total,
          paidAmount,
          amountReceived: payment.amountReceived,
          changeAmount: payment.changeAmount,
          balance,
          paymentMethod: dto.paymentMethod,
          issuedById: user.id,
          cashSessionId: cashSession.id,
          issuedAt,
          dueDate: issuedAt,
          items: {
            create: computed.items.map((item) => ({
              productId: item.productId,
              sku: item.sku,
              barcode: item.barcode,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountTotal: item.discountTotal,
              taxRate: item.taxRate,
              taxTotal: item.taxTotal,
              subtotal: item.subtotal,
              total: item.total,
            })),
          },
        },
        include: {
          customer: true,
          items: true,
          payments: true,
          electronicDocument: true,
        },
      });

      for (const item of computed.items) {
        await this.applyInventoryForSale(tx, {
          tenantId,
          item,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          userId: user.id,
          fromOrder: Boolean(order),
        });
      }

      if (paidAmount.gt(0)) {
        await tx.payment.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            method: dto.paymentMethod,
            amount: paidAmount,
            status: PaymentStatus.COMPLETED,
            userId: user.id,
            cashSessionId: cashSession.id,
            paidAt: issuedAt,
          },
        });

        await tx.cashMovement.create({
          data: {
            tenantId,
            cashSessionId: cashSession.id,
            userId: user.id,
            type: CashMovementType.SALE_PAYMENT,
            amount: paidAmount,
            method: dto.paymentMethod,
            reason: 'Pago de venta POS',
            reference: invoice.invoiceNumber,
            invoiceId: invoice.id,
          },
        });
      }

      await tx.employeeActivityLog.createMany({
        data: [
          {
            tenantId,
            userId: user.id,
            cashSessionId: cashSession.id,
            action: EmployeeLogAction.CREATE_SALE,
            entity: 'Invoice',
            entityId: invoice.id,
            invoiceId: invoice.id,
            amount: computed.total,
            metadata: {
              invoiceNumber,
              eNcf,
              paymentMethod: dto.paymentMethod,
              amountReceived: payment.amountReceived.toString(),
              changeAmount: payment.changeAmount.toString(),
              orderNumber: order?.orderNumber,
            },
          },
          {
            tenantId,
            userId: user.id,
            cashSessionId: cashSession.id,
            action: EmployeeLogAction.ISSUE_INVOICE,
            entity: 'Invoice',
            entityId: invoice.id,
            invoiceId: invoice.id,
            amount: computed.total,
            metadata: {
              invoiceNumber,
              documentType,
              amountReceived: payment.amountReceived.toString(),
              changeAmount: payment.changeAmount.toString(),
              orderNumber: order?.orderNumber,
            },
          },
          ...(order
            ? [
                {
                  tenantId,
                  userId: user.id,
                  cashSessionId: cashSession.id,
                  action: EmployeeLogAction.COMPLETE_SALES_ORDER,
                  entity: 'SalesOrder',
                  entityId: order.id,
                  invoiceId: invoice.id,
                  amount: computed.total,
                  metadata: {
                    orderNumber: order.orderNumber,
                    invoiceNumber,
                  },
                },
              ]
            : []),
        ],
      });

      if (order) {
        await tx.salesOrder.update({
          where: { id: order.id },
          data: {
            status: SalesOrderStatus.COMPLETED,
            completedById: user.id,
            invoiceId: invoice.id,
            completedAt: issuedAt,
            claimExpiresAt: null,
          },
        });
      }

      await tx.electronicDocument.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          provider: ElectronicDocumentProvider.DGII_DIRECT,
          status: ElectronicDocumentStatus.SIGNED,
          trackId: `DEMO-${invoice.invoiceNumber}`,
          requestPayload: {
            mode: 'demo',
            documentType,
            eNcf,
          },
          responsePayload: {
            mode: 'demo',
            status: 'SIGNED',
          },
        },
      });

      return tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: {
          customer: true,
          items: true,
          payments: true,
          electronicDocument: true,
          issuedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          cashSession: {
            include: {
              cashRegister: true,
            },
          },
        },
      });
    });
  }

  private async claimOrderForSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    cashSessionId: string,
    orderId: string,
  ) {
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + claimTtlMs);

    const claimed = await tx.salesOrder.updateMany({
      where: {
        id: orderId,
        tenantId,
        destination: SalesOrderDestination.CASH_SALE,
        invoiceId: null,
        OR: [
          { status: SalesOrderStatus.SENT_TO_CASHIER },
          {
            status: SalesOrderStatus.IN_CASHIER,
            claimedById: userId,
          },
          {
            status: SalesOrderStatus.IN_CASHIER,
            claimExpiresAt: { lt: now },
          },
        ],
      },
      data: {
        status: SalesOrderStatus.IN_CASHIER,
        claimedById: userId,
        claimedCashSessionId: cashSessionId,
        claimedAt: now,
        claimExpiresAt,
        releasedAt: null,
      },
    });

    if (claimed.count !== 1) {
      const existing = await tx.salesOrder.findFirst({
        where: { id: orderId, tenantId },
        select: {
          id: true,
          status: true,
          claimedById: true,
          invoiceId: true,
        },
      });

      if (!existing) {
        throw new NotFoundException('Pending sales order not found for tenant.');
      }

      if (existing.status === SalesOrderStatus.COMPLETED || existing.invoiceId) {
        throw new BadRequestException('Sales order has already been completed.');
      }

      if (existing.status === SalesOrderStatus.CANCELLED) {
        throw new BadRequestException('Sales order has already been cancelled.');
      }

      throw new BadRequestException('Sales order is already claimed by another cashier.');
    }

    return tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  private async computeSale(
    tenantId: string,
    items: PosSaleItemDto[],
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    if (!items.length) {
      throw new BadRequestException('Sale must include at least one item.');
    }

    const quantitiesByProduct = new Map<string, number>();
    for (const item of items) {
      quantitiesByProduct.set(
        item.productId,
        (quantitiesByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const products = await client.product.findMany({
      where: {
        tenantId,
        id: {
          in: Array.from(quantitiesByProduct.keys()),
        },
        status: ProductStatus.ACTIVE,
      },
    });

    if (products.length !== quantitiesByProduct.size) {
      throw new NotFoundException('One or more POS products do not belong to tenant.');
    }

    const computedItems: ComputedSaleLine[] = products.map((product) => {
      const quantity = new Prisma.Decimal(quantitiesByProduct.get(product.id) ?? 0);
      const unitPrice = product.salePrice.gt(0) ? product.salePrice : product.price;
      const subtotal = quantity.mul(unitPrice).toDecimalPlaces(2);
      const discountTotal = new Prisma.Decimal(0);
      const taxTotal = subtotal.mul(product.taxRate).toDecimalPlaces(2);

      return {
        product,
        productId: product.id,
        sku: product.sku,
        barcode: product.barcode,
        description: product.name,
        quantity,
        reservedQuantity: 0,
        unitPrice,
        discountTotal,
        taxRate: product.taxRate,
        subtotal,
        taxTotal,
        total: subtotal.add(taxTotal).toDecimalPlaces(2),
      };
    });

    for (const item of computedItems) {
      const quantity = item.quantity.toNumber();
      const availableStock = item.product.stock - item.product.reservedStock;

      if (
        item.product.trackInventory &&
        requiresWholeQuantity(item.product.unit) &&
        !Number.isInteger(quantity)
      ) {
        throw new BadRequestException(
          `Tracked product ${item.product.name} requires whole quantities.`,
        );
      }

      if (item.product.trackInventory && availableStock < quantity) {
        throw new BadRequestException(`Insufficient available stock for ${item.product.name}.`);
      }
    }

    return {
      items: computedItems,
      subtotal: computedItems
        .reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      discountTotal: computedItems
        .reduce((sum, item) => sum.add(item.discountTotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      taxTotal: computedItems
        .reduce((sum, item) => sum.add(item.taxTotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      total: computedItems
        .reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
    };
  }

  private async computeSaleFromOrder(order: {
    items: Array<{
      productId: string | null;
      sku: string | null;
      barcode: string | null;
      description: string;
      quantity: Prisma.Decimal;
      reservedQuantity: number;
      unitPrice: Prisma.Decimal;
      discountTotal: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxTotal: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      total: Prisma.Decimal;
      product: Product | null;
    }>;
  }) {
    const computedItems: ComputedSaleLine[] = order.items.map((item) => {
      if (!item.productId || !item.product) {
        throw new BadRequestException('Sales order contains an unavailable product.');
      }

      return {
        product: item.product,
        productId: item.productId,
        sku: item.sku,
        barcode: item.barcode,
        description: item.description,
        quantity: item.quantity,
        reservedQuantity: item.reservedQuantity,
        unitPrice: item.unitPrice,
        discountTotal: item.discountTotal,
        taxRate: item.taxRate,
        taxTotal: item.taxTotal,
        subtotal: item.subtotal,
        total: item.total,
      };
    });

    for (const item of computedItems) {
      const quantity = item.quantity.toNumber();

      if (
        item.product.trackInventory &&
        requiresWholeQuantity(item.product.unit) &&
        !Number.isInteger(quantity)
      ) {
        throw new BadRequestException(
          `Tracked product ${item.description} requires whole quantities.`,
        );
      }

      if (item.product.trackInventory && item.product.stock < quantity) {
        throw new BadRequestException(`Insufficient stock for ${item.description}.`);
      }
    }

    return {
      items: computedItems,
      subtotal: computedItems
        .reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      discountTotal: computedItems
        .reduce((sum, item) => sum.add(item.discountTotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      taxTotal: computedItems
        .reduce((sum, item) => sum.add(item.taxTotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      total: computedItems
        .reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
    };
  }

  private async applyInventoryForSale(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      item: ComputedSaleLine;
      invoiceId: string;
      invoiceNumber: string;
      userId: string;
      fromOrder: boolean;
    },
  ) {
    const { tenantId, item, invoiceId, invoiceNumber, userId, fromOrder } = args;

    if (!item.product.trackInventory) {
      return;
    }

    const quantity = item.quantity.toNumber();
    if (requiresWholeQuantity(item.product.unit) && !Number.isInteger(quantity)) {
      throw new BadRequestException(
        `Tracked product ${item.description} requires whole quantities.`,
      );
    }

    const updated = fromOrder
      ? await tx.$queryRaw<Array<{ stock: number; reservedStock: number }>>`
          UPDATE "Product"
          SET
            "stock" = "stock" - ${quantity},
            "reservedStock" = GREATEST("reservedStock" - ${item.reservedQuantity}, 0)
          WHERE "id" = ${item.productId}
            AND "tenantId" = ${tenantId}
            AND "trackInventory" = TRUE
            AND "stock" >= ${quantity}
          RETURNING "stock", "reservedStock"
        `
      : await tx.$queryRaw<Array<{ stock: number; reservedStock: number }>>`
          UPDATE "Product"
          SET "stock" = "stock" - ${quantity}
          WHERE "id" = ${item.productId}
            AND "tenantId" = ${tenantId}
            AND "trackInventory" = TRUE
            AND ("stock" - "reservedStock") >= ${quantity}
          RETURNING "stock", "reservedStock"
        `;

    if (updated.length !== 1) {
      const message = fromOrder
        ? `Insufficient stock for ${item.description}.`
        : `Insufficient available stock for ${item.description}.`;
      throw new BadRequestException(message);
    }

    const newStock = updated[0].stock;
    const previousStock = newStock + quantity;

    await tx.inventoryMovement.create({
      data: {
        tenantId,
        productId: item.productId,
        type: InventoryMovementType.SALE,
        quantity,
        previousStock,
        newStock,
        unitCost: item.product.cost,
        reason: fromOrder ? 'Venta POS facturada desde orden' : 'Venta POS facturada',
        reference: invoiceNumber,
        invoiceId,
        createdById: userId,
      },
    });
  }

  private async reserveFiscalSequence(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentType: InvoiceDocumentType,
  ) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sequence = await tx.fiscalSequence.findFirst({
        where: {
          tenantId,
          documentType,
          status: FiscalSequenceStatus.ACTIVE,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (!sequence || sequence.nextNumber > sequence.endNumber) {
        throw new BadRequestException(
          'No active fiscal sequence available for this document type.',
        );
      }

      const reserved = await tx.fiscalSequence.updateMany({
        where: {
          id: sequence.id,
          nextNumber: sequence.nextNumber,
          status: FiscalSequenceStatus.ACTIVE,
        },
        data: {
          nextNumber: {
            increment: 1,
          },
          ...(sequence.nextNumber >= sequence.endNumber
            ? { status: FiscalSequenceStatus.EXHAUSTED }
            : {}),
        },
      });

      if (reserved.count === 1) {
        return {
          prefix: sequence.prefix,
          number: sequence.nextNumber,
        };
      }
    }

    throw new BadRequestException('Could not reserve fiscal sequence.');
  }

  private formatFiscalNumber(prefix: string, number: number) {
    const width = prefix === 'BA' ? 4 : 10;
    return `${prefix}${String(number).padStart(width, '0')}`;
  }

  private async findCashSessionForSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    cashSessionId?: string,
  ) {
    const session = await tx.cashSession.findFirst({
      where: {
        tenantId,
        openedById: userId,
        status: CashSessionStatus.OPEN,
        ...(cashSessionId ? { id: cashSessionId } : {}),
      },
      orderBy: {
        openedAt: 'desc',
      },
    });

    if (!session) {
      throw new BadRequestException(
        'An open cash session for this cashier is required to complete POS sales.',
      );
    }

    return session;
  }

  private async ensureCanCreateDirectSale(tenantId: string, user: AuthenticatedUser) {
    const membership = await this.ensureCanUsePos(tenantId, user);

    if (!this.isAdminMembership(membership)) {
      throw new ForbiddenException('Only admins can create direct POS sales.');
    }

    return membership;
  }

  private async ensureCanUsePos(tenantId: string, user: AuthenticatedUser) {
    const membership = user.memberships.find((candidate) => candidate.tenantId === tenantId);

    if (
      !membership ||
      (!membership.canUsePos && ![...adminRoles, Role.CASHIER].includes(membership.role))
    ) {
      throw new ForbiddenException('Employee does not have POS access.');
    }

    if (membership.role !== Role.SUPER_ADMIN) {
      const employee = await this.prisma.employeeProfile.findFirst({
        where: {
          tenantId,
          userId: user.id,
          status: EmployeeStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (!employee) {
        throw new ForbiddenException('Employee profile must be active to use POS.');
      }
    }

    return membership;
  }

  private isAdminMembership(membership: AuthenticatedUser['memberships'][number]) {
    return adminRoles.includes(membership.role);
  }

  private getPaymentAmounts(
    amountReceived: number | undefined,
    total: Prisma.Decimal,
    paymentMethod: PaymentMethod,
  ) {
    const tendered = new Prisma.Decimal(amountReceived ?? total).toDecimalPlaces(2);

    if (tendered.lt(0)) {
      throw new BadRequestException('Amount received cannot be negative.');
    }

    if (paymentMethod === PaymentMethod.CASH && tendered.lt(total)) {
      throw new BadRequestException('Cash received must cover the invoice total.');
    }

    if (paymentMethod !== PaymentMethod.CASH && tendered.lt(total)) {
      throw new BadRequestException('Payment amount must cover the invoice total.');
    }

    return {
      paidAmount: total.toDecimalPlaces(2),
      amountReceived: tendered,
      changeAmount:
        paymentMethod === PaymentMethod.CASH && tendered.gt(total)
          ? tendered.sub(total).toDecimalPlaces(2)
          : new Prisma.Decimal(0),
    };
  }

  private getInvoiceStatus(paidAmount: Prisma.Decimal, total: Prisma.Decimal) {
    if (paidAmount.gte(total)) {
      return InvoiceStatus.PAID;
    }

    if (paidAmount.gt(0)) {
      return InvoiceStatus.PARTIALLY_PAID;
    }

    return InvoiceStatus.ISSUED;
  }
}

function requiresWholeQuantity(unit: ProductUnit) {
  const fractionalUnits: ProductUnit[] = [
    ProductUnit.METER,
    ProductUnit.FOOT,
    ProductUnit.YARD,
    ProductUnit.POUND,
  ];
  return !fractionalUnits.includes(unit);
}
