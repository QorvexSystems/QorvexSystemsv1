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
  ProductStatus,
  Role,
} from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CompleteSaleDto, PosSaleItemDto } from './dto/complete-sale.dto';

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(tenantId: string, user: AuthenticatedUser, q: string) {
    await this.ensureCanUsePos(tenantId, user);
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
    await this.ensureCanUsePos(tenantId, user);
    const normalizedBarcode = this.normalizeBarcode(barcode);
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        barcode: normalizedBarcode,
        status: ProductStatus.ACTIVE,
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
    await this.ensureCanUsePos(tenantId, user);
    const computed = await this.computeSale(tenantId, dto.items);

    return {
      documentType: dto.documentType ?? InvoiceDocumentType.CONSUMER_ELECTRONIC_32,
      paymentMethod: dto.paymentMethod,
      subtotal: computed.subtotal.toNumber(),
      taxTotal: computed.taxTotal.toNumber(),
      total: computed.total.toNumber(),
      items: computed.items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        quantity: item.quantity.toNumber(),
        unitPrice: item.unitPrice.toNumber(),
        subtotal: item.subtotal.toNumber(),
        taxTotal: item.taxTotal.toNumber(),
        total: item.total.toNumber(),
      })),
    };
  }

  async completeSale(tenantId: string, user: AuthenticatedUser, dto: CompleteSaleDto) {
    await this.ensureCanUsePos(tenantId, user);

    if (!dto.items.length) {
      throw new BadRequestException('Sale must include at least one item.');
    }

    return this.prisma.$transaction(async (tx) => {
      const documentType = dto.documentType ?? InvoiceDocumentType.CONSUMER_ELECTRONIC_32;
      const customer = dto.customerId
        ? await tx.customer.findFirst({
            where: {
              id: dto.customerId,
              tenantId,
            },
          })
        : null;

      if (dto.customerId && !customer) {
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

      const cashSession = await this.findCashSessionForSale(tx, tenantId, user.id, dto.cashSessionId);
      const computed = await this.computeSale(tenantId, dto.items, tx);
      const sequence = await this.reserveFiscalSequence(tx, tenantId, documentType);
      const payment = this.getPaymentAmounts(dto.amountReceived, computed.total, dto.paymentMethod);
      const paidAmount = payment.paidAmount;
      const balance = computed.total.sub(paidAmount).toDecimalPlaces(2);
      const status = this.getInvoiceStatus(paidAmount, computed.total);
      const issuedAt = new Date();
      const invoiceNumber = `RIV-${sequence.prefix}-${String(sequence.number).padStart(6, '0')}`;
      const eNcf = `${sequence.prefix}${String(sequence.number).padStart(10, '0')}`;

      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          customerId: customer?.id,
          documentType,
          invoiceNumber,
          eNcf,
          status,
          fiscalStatus: InvoiceFiscalStatus.SIGNED,
          subtotal: computed.subtotal,
          taxTotal: computed.taxTotal,
          discountTotal: new Prisma.Decimal(0),
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
              productId: item.product.id,
              sku: item.product.sku,
              barcode: item.product.barcode,
              description: item.product.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountTotal: new Prisma.Decimal(0),
              taxRate: item.product.taxRate,
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
        if (!item.product.trackInventory) {
          continue;
        }

        const quantity = item.quantity.toNumber();
        if (!Number.isInteger(quantity)) {
          throw new BadRequestException(
            `Tracked product ${item.product.name} requires integer quantities.`,
          );
        }

        const previousStock = item.product.stock;
        const newStock = previousStock - quantity;

        if (newStock < 0) {
          throw new BadRequestException(`Insufficient stock for ${item.product.name}.`);
        }

        await tx.product.update({
          where: { id: item.product.id },
          data: {
            stock: newStock,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: item.product.id,
            type: InventoryMovementType.SALE,
            quantity,
            previousStock,
            newStock,
            unitCost: item.product.cost,
            reason: 'Venta POS facturada',
            reference: invoice.invoiceNumber,
            invoiceId: invoice.id,
            createdById: user.id,
          },
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
            },
          },
        ],
      });

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

    const computedItems = products.map((product) => {
      const quantity = new Prisma.Decimal(quantitiesByProduct.get(product.id) ?? 0);
      const unitPrice = product.salePrice.gt(0) ? product.salePrice : product.price;
      const subtotal = quantity.mul(unitPrice).toDecimalPlaces(2);
      const taxTotal = subtotal.mul(product.taxRate).toDecimalPlaces(2);

      return {
        product,
        quantity,
        unitPrice,
        subtotal,
        taxTotal,
        total: subtotal.add(taxTotal).toDecimalPlaces(2),
      };
    });

    for (const item of computedItems) {
      const quantity = item.quantity.toNumber();

      if (item.product.trackInventory && !Number.isInteger(quantity)) {
        throw new BadRequestException(
          `Tracked product ${item.product.name} requires integer quantities.`,
        );
      }

      if (item.product.trackInventory && item.product.stock < quantity) {
        throw new BadRequestException(`Insufficient stock for ${item.product.name}.`);
      }
    }

    return {
      items: computedItems,
      subtotal: computedItems
        .reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      taxTotal: computedItems
        .reduce((sum, item) => sum.add(item.taxTotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      total: computedItems
        .reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
    };
  }

  private async reserveFiscalSequence(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentType: InvoiceDocumentType,
  ) {
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
      throw new BadRequestException('No active fiscal sequence available for this document type.');
    }

    await tx.fiscalSequence.update({
      where: { id: sequence.id },
      data: {
        nextNumber: {
          increment: 1,
        },
      },
    });

    return {
      prefix: sequence.prefix,
      number: sequence.nextNumber,
    };
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
      throw new BadRequestException('An open cash session for this cashier is required to complete POS sales.');
    }

    return session;
  }

  private async ensureCanUsePos(tenantId: string, user: AuthenticatedUser) {
    const membership = user.memberships.find((candidate) => candidate.tenantId === tenantId);

    if (
      !membership ||
      (!membership.canUsePos &&
        !([Role.ADMIN, Role.CASHIER, Role.SUPER_ADMIN] as Role[]).includes(membership.role))
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
      changeAmount: paymentMethod === PaymentMethod.CASH && tendered.gt(total)
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

  private normalizeBarcode(barcode: string) {
    return barcode.trim().replace(/\s+/g, '').toUpperCase();
  }
}
