import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeLogAction,
  EmployeeStatus,
  Prisma,
  ProductStatus,
  Role,
  SalesOrderStatus,
} from '@qorvex/database';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesOrderDto, SalesOrderItemDto } from './dto/create-sales-order.dto';

const adminRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, user: AuthenticatedUser, status?: string) {
    const membership = this.getMembership(tenantId, user);
    this.ensureCanViewOrders(membership);

    const parsedStatus = this.parseStatus(status);
    const ownOrdersOnly =
      !adminRoles.includes(membership.role) &&
      membership.role === Role.ORDER_TAKER;

    return this.prisma.salesOrder.findMany({
      where: {
        tenantId,
        ...(parsedStatus ? { status: parsedStatus } : {}),
        ...(ownOrdersOnly ? { createdById: user.id } : {}),
      },
      include: this.orderInclude(),
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  async findOne(tenantId: string, user: AuthenticatedUser, id: string) {
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
    const normalizedBarcode = this.normalizeBarcode(barcode);
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        barcode: normalizedBarcode,
        status: ProductStatus.ACTIVE,
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

  async cancel(tenantId: string, user: AuthenticatedUser, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
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
        membership.role === Role.ORDER_TAKER);

    if (!canCancel) {
      throw new ForbiddenException('Employee does not have permission to cancel this sales order.');
    }

    if (order.status !== SalesOrderStatus.SENT_TO_CASHIER) {
      throw new BadRequestException('Only pending sales orders can be cancelled.');
    }

    const cancelled = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: SalesOrderStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: this.orderInclude(),
    });

    await this.prisma.employeeActivityLog.create({
      data: {
        tenantId,
        userId: user.id,
        action: EmployeeLogAction.CANCEL_SALES_ORDER,
        entity: 'SalesOrder',
        entityId: id,
        amount: cancelled.total,
        metadata: { orderNumber: cancelled.orderNumber },
      },
    });

    return cancelled;
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

  private parseStatus(status?: string) {
    if (!status) {
      return undefined;
    }

    if (!Object.values(SalesOrderStatus).includes(status as SalesOrderStatus)) {
      throw new BadRequestException('Invalid sales order status.');
    }

    return status as SalesOrderStatus;
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
      const employee = await this.prisma.employeeProfile.findFirst({
        where: {
          tenantId,
          userId: user.id,
          status: EmployeeStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (!employee) {
        throw new ForbiddenException('Employee profile must be active to take orders.');
      }
    }
  }

  private orderInclude() {
    return {
      customer: true,
      createdBy: { select: { id: true, name: true, email: true } },
      completedBy: { select: { id: true, name: true, email: true } },
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

  private normalizeBarcode(barcode: string) {
    return barcode.trim().replace(/\s+/g, '').toUpperCase();
  }
}
