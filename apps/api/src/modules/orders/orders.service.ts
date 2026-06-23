import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashSessionStatus,
  EmployeeLogAction,
  EmployeeStatus,
  Prisma,
  ProductStatus,
  Role,
  SalesOrderStatus,
} from '@qorvex/database';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { getBarcodeLookupCandidates } from '../../common/utils/barcode';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CancelSalesOrderDto,
  ClaimSalesOrderDto,
  CreateSalesOrderDto,
  SalesOrderItemDto,
} from './dto/create-sales-order.dto';

const adminRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN];
const openOrderStatuses: SalesOrderStatus[] = [
  SalesOrderStatus.SENT_TO_CASHIER,
  SalesOrderStatus.IN_CASHIER,
];
const claimTtlMs = 30 * 60 * 1000;

type ComputedOrderItem = {
  product: Awaited<ReturnType<PrismaService['product']['findMany']>>[number];
  quantity: Prisma.Decimal;
  reservedQuantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, user: AuthenticatedUser, status?: string) {
    await this.releaseExpiredClaims(tenantId);

    const membership = this.getMembership(tenantId, user);
    this.ensureCanViewOrders(membership);

    const parsedStatuses = this.parseStatuses(status);
    const ownOrdersOnly =
      !adminRoles.includes(membership.role) &&
      membership.role === Role.ORDER_TAKER;

    return this.prisma.salesOrder.findMany({
      where: {
        tenantId,
        ...(parsedStatuses ? { status: { in: parsedStatuses } } : {}),
        ...(ownOrdersOnly ? { createdById: user.id } : {}),
      },
      include: this.orderInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 150,
    });
  }

  async findOne(tenantId: string, user: AuthenticatedUser, id: string) {
    await this.releaseExpiredClaims(tenantId);

    const membership = this.getMembership(tenantId, user);
    this.ensureCanViewOrders(membership);

    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: this.orderInclude(),
    });

    if (!order) {
      throw new NotFoundException('Sales order not found for tenant.');
    }

    if (
      !adminRoles.includes(membership.role) &&
      membership.role !== Role.CASHIER &&
      !membership.canUsePos &&
      order.createdById !== user.id
    ) {
      throw new ForbiddenException('Employee does not have permission to view this sales order.');
    }

    return order;
  }

  async searchProducts(tenantId: string, user: AuthenticatedUser, q: string) {
    await this.ensureCanTakeOrders(tenantId, user);
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

  async findProductByBarcode(tenantId: string, user: AuthenticatedUser, barcode: string) {
    await this.ensureCanTakeOrders(tenantId, user);
    const lookupCandidates = getBarcodeLookupCandidates(barcode);
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        status: ProductStatus.ACTIVE,
        OR: [{ barcode: { in: lookupCandidates } }, { sku: { in: lookupCandidates } }],
      },
      include: { category: true },
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

  async create(tenantId: string, user: AuthenticatedUser, dto: CreateSalesOrderDto) {
    await this.ensureCanTakeOrders(tenantId, user);

    if (!dto.items.length) {
      throw new BadRequestException('Sales order must include at least one item.');
    }

    const customer = dto.customerId
      ? await this.prisma.customer.findFirst({
          where: {
            id: dto.customerId,
            tenantId,
          },
        })
      : null;

    if (dto.customerId && !customer) {
      throw new NotFoundException('Customer not found for tenant.');
    }

    return this.prisma.$transaction(async (tx) => {
      const computed = await this.computeOrder(tenantId, dto.items, tx);
      await this.reserveStockForOrder(tenantId, computed.items, tx);

      const now = new Date();
      const order = await tx.salesOrder.create({
        data: {
          tenantId,
          customerId: customer?.id,
          orderNumber: this.generateOrderNumber(),
          status: SalesOrderStatus.SENT_TO_CASHIER,
          subtotal: computed.subtotal,
          taxTotal: computed.taxTotal,
          total: computed.total,
          notes: dto.notes?.trim() || undefined,
          createdById: user.id,
          sentToCashierAt: now,
          items: {
            create: computed.items.map((item) => ({
              productId: item.product.id,
              sku: item.product.sku,
              barcode: item.product.barcode,
              description: item.product.name,
              quantity: item.quantity,
              reservedQuantity: item.reservedQuantity,
              unitPrice: item.unitPrice,
              taxRate: item.product.taxRate,
              taxTotal: item.taxTotal,
              subtotal: item.subtotal,
              total: item.total,
            })),
          },
        },
        include: this.orderInclude(),
      });

      await tx.employeeActivityLog.createMany({
        data: [
          {
            tenantId,
            userId: user.id,
            action: EmployeeLogAction.CREATE_SALES_ORDER,
            entity: 'SalesOrder',
            entityId: order.id,
            amount: computed.total,
            metadata: { orderNumber: order.orderNumber },
          },
          {
            tenantId,
            userId: user.id,
            action: EmployeeLogAction.SEND_SALES_ORDER_TO_CASHIER,
            entity: 'SalesOrder',
            entityId: order.id,
            amount: computed.total,
            metadata: { orderNumber: order.orderNumber },
          },
        ],
      });

      return order;
    });
  }

  async claim(tenantId: string, user: AuthenticatedUser, id: string, dto: ClaimSalesOrderDto) {
    const membership = await this.ensureCanUsePosForOrders(tenantId, user);
    const cashSession = await this.findOpenCashSessionForUser(tenantId, user.id, dto.cashSessionId);
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + claimTtlMs);

    await this.releaseExpiredClaims(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.salesOrder.updateMany({
        where: {
          id,
          tenantId,
          invoiceId: null,
          OR: [
            { status: SalesOrderStatus.SENT_TO_CASHIER },
            {
              status: SalesOrderStatus.IN_CASHIER,
              claimedById: user.id,
            },
            {
              status: SalesOrderStatus.IN_CASHIER,
              claimExpiresAt: { lt: now },
            },
          ],
        },
        data: {
          status: SalesOrderStatus.IN_CASHIER,
          claimedById: user.id,
          claimedCashSessionId: cashSession.id,
          claimedAt: now,
          claimExpiresAt,
          releasedAt: null,
        },
      });

      if (claimed.count !== 1) {
        const existing = await tx.salesOrder.findFirst({
          where: { id, tenantId },
          include: this.orderInclude(),
        });

        if (!existing) {
          throw new NotFoundException('Sales order not found for tenant.');
        }

        if (existing.status === SalesOrderStatus.COMPLETED) {
          throw new BadRequestException('Sales order has already been completed.');
        }

        if (existing.status === SalesOrderStatus.CANCELLED) {
          throw new BadRequestException('Sales order has already been cancelled.');
        }

        throw new BadRequestException('Sales order is already claimed by another cashier.');
      }

      const order = await tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: this.orderInclude(),
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: user.id,
          cashSessionId: cashSession.id,
          action: EmployeeLogAction.CLAIM_SALES_ORDER,
          entity: 'SalesOrder',
          entityId: id,
          amount: order.total,
          metadata: {
            orderNumber: order.orderNumber,
            role: membership.role,
            cashRegister: cashSession.cashRegister.name,
          },
        },
      });

      return order;
    });
  }

  async release(tenantId: string, user: AuthenticatedUser, id: string) {
    const membership = this.getMembership(tenantId, user);
    this.ensureCanViewOrders(membership);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id, tenantId },
        include: this.orderInclude(),
      });

      if (!order) {
        throw new NotFoundException('Sales order not found for tenant.');
      }

      if (order.status !== SalesOrderStatus.IN_CASHIER) {
        throw new BadRequestException('Only claimed sales orders can be released.');
      }

      if (!adminRoles.includes(membership.role) && order.claimedById !== user.id) {
        throw new ForbiddenException('Employee does not have permission to release this sales order.');
      }

      const released = await tx.salesOrder.update({
        where: { id },
        data: {
          status: SalesOrderStatus.SENT_TO_CASHIER,
          claimedById: null,
          claimedCashSessionId: null,
          claimedAt: null,
          claimExpiresAt: null,
          releasedAt: new Date(),
        },
        include: this.orderInclude(),
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: user.id,
          cashSessionId: order.claimedCashSessionId,
          action: EmployeeLogAction.RELEASE_SALES_ORDER,
          entity: 'SalesOrder',
          entityId: id,
          amount: released.total,
          metadata: { orderNumber: released.orderNumber },
        },
      });

      return released;
    });
  }

  async cancel(tenantId: string, user: AuthenticatedUser, id: string, dto?: CancelSalesOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id, tenantId },
        include: this.orderInclude(),
      });

      if (!order) {
        throw new NotFoundException('Sales order not found for tenant.');
      }

      const membership = this.getMembership(tenantId, user);
      const canCancel =
        adminRoles.includes(membership.role) ||
        (order.createdById === user.id &&
          order.status === SalesOrderStatus.SENT_TO_CASHIER &&
          membership.role === Role.ORDER_TAKER) ||
        (order.claimedById === user.id &&
          order.status === SalesOrderStatus.IN_CASHIER &&
          (membership.role === Role.CASHIER || membership.canUsePos));

      if (!canCancel) {
        throw new ForbiddenException('Employee does not have permission to cancel this sales order.');
      }

      if (!openOrderStatuses.includes(order.status)) {
        throw new BadRequestException('Only pending sales orders can be cancelled.');
      }

      const cancelledRows = await tx.salesOrder.updateMany({
        where: {
          id,
          tenantId,
          status: { in: openOrderStatuses },
        },
        data: {
          status: SalesOrderStatus.CANCELLED,
          claimedById: null,
          claimedCashSessionId: null,
          claimExpiresAt: null,
          cancelledAt: new Date(),
          cancelReason: dto?.reason?.trim() || undefined,
        },
      });

      if (cancelledRows.count !== 1) {
        throw new BadRequestException('Only pending sales orders can be cancelled.');
      }

      await this.releaseReservedStock(order.items, tx);

      const cancelled = await tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: this.orderInclude(),
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: user.id,
          cashSessionId: order.claimedCashSessionId,
          action: EmployeeLogAction.CANCEL_SALES_ORDER,
          entity: 'SalesOrder',
          entityId: id,
          amount: cancelled.total,
          metadata: {
            orderNumber: cancelled.orderNumber,
            reason: cancelled.cancelReason,
          },
        },
      });

      return cancelled;
    });
  }

  private async computeOrder(
    tenantId: string,
    items: SalesOrderItemDto[],
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    if (!items.length) {
      throw new BadRequestException('Sales order must include at least one item.');
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
        id: { in: Array.from(quantitiesByProduct.keys()) },
        status: ProductStatus.ACTIVE,
      },
    });

    if (products.length !== quantitiesByProduct.size) {
      throw new NotFoundException('One or more order products do not belong to tenant.');
    }

    const computedItems: ComputedOrderItem[] = products.map((product) => {
      const quantity = new Prisma.Decimal(quantitiesByProduct.get(product.id) ?? 0);
      const unitPrice = product.salePrice.gt(0) ? product.salePrice : product.price;
      const subtotal = quantity.mul(unitPrice).toDecimalPlaces(2);
      const taxTotal = subtotal.mul(product.taxRate).toDecimalPlaces(2);

      return {
        product,
        quantity,
        reservedQuantity: product.trackInventory ? quantity.toNumber() : 0,
        unitPrice,
        subtotal,
        taxTotal,
        total: subtotal.add(taxTotal).toDecimalPlaces(2),
      };
    });

    for (const item of computedItems) {
      const quantity = item.quantity.toNumber();
      const availableStock = item.product.stock - item.product.reservedStock;

      if (item.product.trackInventory && !Number.isInteger(quantity)) {
        throw new BadRequestException(
          `Tracked product ${item.product.name} requires integer quantities.`,
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
      taxTotal: computedItems
        .reduce((sum, item) => sum.add(item.taxTotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
      total: computedItems
        .reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0))
        .toDecimalPlaces(2),
    };
  }

  private async reserveStockForOrder(
    tenantId: string,
    items: ComputedOrderItem[],
    tx: Prisma.TransactionClient,
  ) {
    for (const item of items) {
      if (!item.product.trackInventory || item.reservedQuantity <= 0) {
        continue;
      }

      const updated = await tx.$executeRaw`
        UPDATE "Product"
        SET "reservedStock" = "reservedStock" + ${item.reservedQuantity}
        WHERE "id" = ${item.product.id}
          AND "tenantId" = ${tenantId}
          AND "trackInventory" = TRUE
          AND ("stock" - "reservedStock") >= ${item.reservedQuantity}
      `;

      if (updated !== 1) {
        throw new BadRequestException(`Insufficient available stock for ${item.product.name}.`);
      }
    }
  }

  private async releaseReservedStock(
    items: Array<{ productId: string | null; reservedQuantity: number }>,
    tx: Prisma.TransactionClient,
  ) {
    for (const item of items) {
      if (!item.productId || item.reservedQuantity <= 0) {
        continue;
      }

      await tx.$executeRaw`
        UPDATE "Product"
        SET "reservedStock" = GREATEST("reservedStock" - ${item.reservedQuantity}, 0)
        WHERE "id" = ${item.productId}
      `;
    }
  }

  private parseStatuses(status?: string) {
    if (!status) {
      return undefined;
    }

    if (status === 'OPEN') {
      return openOrderStatuses;
    }

    if (!Object.values(SalesOrderStatus).includes(status as SalesOrderStatus)) {
      throw new BadRequestException('Invalid sales order status.');
    }

    return [status as SalesOrderStatus];
  }

  private getMembership(tenantId: string, user: AuthenticatedUser) {
    const membership = user.memberships.find((candidate) => candidate.tenantId === tenantId);

    if (!membership) {
      throw new ForbiddenException('User does not belong to this tenant.');
    }

    return membership;
  }

  private ensureCanViewOrders(membership: AuthenticatedUser['memberships'][number]) {
    if (
      !adminRoles.includes(membership.role) &&
      !membership.canUsePos &&
      membership.role !== Role.CASHIER &&
      membership.role !== Role.ORDER_TAKER
    ) {
      throw new ForbiddenException('Employee does not have permission to view sales orders.');
    }
  }

  private async ensureCanTakeOrders(tenantId: string, user: AuthenticatedUser) {
    const membership = this.getMembership(tenantId, user);

    if (
      !adminRoles.includes(membership.role) &&
      membership.role !== Role.ORDER_TAKER
    ) {
      throw new ForbiddenException('Employee does not have permission to take orders.');
    }

    if (!adminRoles.includes(membership.role)) {
      await this.ensureActiveEmployeeProfile(tenantId, user.id, 'take orders');
    }
  }

  private async ensureCanUsePosForOrders(tenantId: string, user: AuthenticatedUser) {
    const membership = this.getMembership(tenantId, user);

    if (
      !adminRoles.includes(membership.role) &&
      !membership.canUsePos &&
      membership.role !== Role.CASHIER
    ) {
      throw new ForbiddenException('Employee does not have POS access.');
    }

    if (membership.role !== Role.SUPER_ADMIN) {
      await this.ensureActiveEmployeeProfile(tenantId, user.id, 'use POS');
    }

    return membership;
  }

  private async ensureActiveEmployeeProfile(tenantId: string, userId: string, operation: string) {
    const employee = await this.prisma.employeeProfile.findFirst({
      where: {
        tenantId,
        userId,
        status: EmployeeStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!employee) {
      throw new ForbiddenException(`Employee profile must be active to ${operation}.`);
    }
  }

  private async findOpenCashSessionForUser(
    tenantId: string,
    userId: string,
    cashSessionId?: string,
  ) {
    const session = await this.prisma.cashSession.findFirst({
      where: {
        tenantId,
        openedById: userId,
        status: CashSessionStatus.OPEN,
        ...(cashSessionId ? { id: cashSessionId } : {}),
      },
      include: { cashRegister: true },
      orderBy: { openedAt: 'desc' },
    });

    if (!session) {
      throw new BadRequestException('An open cash session for this cashier is required to claim sales orders.');
    }

    return session;
  }

  private async releaseExpiredClaims(tenantId: string) {
    const now = new Date();
    await this.prisma.salesOrder.updateMany({
      where: {
        tenantId,
        status: SalesOrderStatus.IN_CASHIER,
        claimExpiresAt: { lt: now },
      },
      data: {
        status: SalesOrderStatus.SENT_TO_CASHIER,
        claimedById: null,
        claimedCashSessionId: null,
        claimedAt: null,
        claimExpiresAt: null,
        releasedAt: now,
      },
    });
  }

  private orderInclude() {
    return {
      customer: true,
      createdBy: { select: { id: true, name: true, email: true } },
      completedBy: { select: { id: true, name: true, email: true } },
      claimedBy: { select: { id: true, name: true, email: true } },
      claimedCashSession: {
        include: {
          cashRegister: true,
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, total: true } },
      items: {
        include: {
          product: { include: { category: true } },
        },
        orderBy: { description: 'asc' as const },
      },
    };
  }

  private generateOrderNumber() {
    const date = new Date();
    const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
    const time = String(date.getHours()).padStart(2, '0') +
      String(date.getMinutes()).padStart(2, '0') +
      String(date.getSeconds()).padStart(2, '0');
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `ORD-${stamp}-${time}-${suffix}`;
  }
}
