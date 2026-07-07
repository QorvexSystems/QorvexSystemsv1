import { Injectable } from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  CustomerStatus,
  EmployeeStatus,
  FiscalSequenceStatus,
  InvoiceStatus,
  PaymentMethod,
  ProductStatus,
  ReturnRequestStatus,
  SalesOrderDestination,
  SalesOrderStatus,
} from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';

const revenueStatuses = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PAID,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PENDING_ECF,
  InvoiceStatus.ACCEPTED,
  InvoiceStatus.CREDITED,
];
const pendingInvoiceStatuses = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PENDING_ECF,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const seriesStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      invoicesForMonth,
      invoicesForToday,
      returnsMonth,
      returnsToday,
      pendingReturnsAggregate,
      pendingInvoices,
      paidInvoices,
      draftInvoices,
      cancelledInvoices,
      activeCustomers,
      activeProducts,
      activeEmployees,
      openCashSessions,
      openCashSessionDetails,
      pendingOrders,
      claimedOrders,
      pendingQuotations,
      completedOrdersToday,
      completedReturns,
      pendingReturns,
      recentInvoices,
      recentReturns,
      recentCashMovements,
      recentEmployeeLogs,
      fiscalSequences,
      productsForStock,
      invoicesForSeries,
      returnsForSeries,
    ] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          status: { in: revenueStatuses },
          issuedAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        select: {
          paidAmount: true,
          total: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          status: { in: revenueStatuses },
          issuedAt: {
            gte: todayStart,
          },
        },
        select: {
          paidAmount: true,
          total: true,
        },
      }),
      this.prisma.returnRequest.aggregate({
        where: {
          tenantId,
          status: ReturnRequestStatus.COMPLETED,
          completedAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.returnRequest.aggregate({
        where: {
          tenantId,
          status: ReturnRequestStatus.COMPLETED,
          completedAt: {
            gte: todayStart,
          },
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.returnRequest.aggregate({
        where: {
          tenantId,
          status: ReturnRequestStatus.REQUESTED,
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          status: { in: pendingInvoiceStatuses },
        },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          status: { in: [InvoiceStatus.PAID, InvoiceStatus.ACCEPTED] },
        },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          status: InvoiceStatus.DRAFT,
        },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          status: { in: [InvoiceStatus.CANCELLED, InvoiceStatus.VOID, InvoiceStatus.VOIDED] },
        },
      }),
      this.prisma.customer.count({
        where: {
          tenantId,
          status: CustomerStatus.ACTIVE,
        },
      }),
      this.prisma.product.count({
        where: {
          tenantId,
          status: ProductStatus.ACTIVE,
        },
      }),
      this.prisma.employeeProfile.count({
        where: {
          tenantId,
          status: EmployeeStatus.ACTIVE,
        },
      }),
      this.prisma.cashSession.count({
        where: {
          tenantId,
          status: CashSessionStatus.OPEN,
        },
      }),
      this.prisma.cashSession.findMany({
        where: {
          tenantId,
          status: CashSessionStatus.OPEN,
        },
        include: {
          cashRegister: true,
          openedBy: { select: { id: true, name: true, email: true } },
          movements: {
            select: {
              type: true,
              amount: true,
              method: true,
            },
          },
        },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.salesOrder.count({
        where: {
          tenantId,
          destination: SalesOrderDestination.CASH_SALE,
          status: SalesOrderStatus.SENT_TO_CASHIER,
        },
      }),
      this.prisma.salesOrder.count({
        where: {
          tenantId,
          destination: SalesOrderDestination.CASH_SALE,
          status: SalesOrderStatus.IN_CASHIER,
        },
      }),
      this.prisma.salesOrder.count({
        where: {
          tenantId,
          destination: SalesOrderDestination.QUOTATION,
          status: SalesOrderStatus.QUOTATION,
        },
      }),
      this.prisma.salesOrder.count({
        where: {
          tenantId,
          status: SalesOrderStatus.COMPLETED,
          completedAt: {
            gte: todayStart,
          },
        },
      }),
      this.prisma.returnRequest.count({
        where: {
          tenantId,
          status: ReturnRequestStatus.COMPLETED,
        },
      }),
      this.prisma.returnRequest.count({
        where: {
          tenantId,
          status: ReturnRequestStatus.REQUESTED,
        },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId },
        include: {
          customer: true,
          issuedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.returnRequest.findMany({
        where: { tenantId },
        include: {
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
          requestedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          rejectedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.cashMovement.findMany({
        where: { tenantId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          cashSession: { include: { cashRegister: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.employeeActivityLog.findMany({
        where: { tenantId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.fiscalSequence.findMany({
        where: {
          tenantId,
          status: FiscalSequenceStatus.ACTIVE,
        },
        orderBy: { documentType: 'asc' },
      }),
      this.prisma.product.findMany({
        where: {
          tenantId,
          status: ProductStatus.ACTIVE,
          trackInventory: true,
        },
        orderBy: {
          stock: 'asc',
        },
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          reservedStock: true,
          minStock: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          status: { in: revenueStatuses },
          issuedAt: {
            gte: seriesStart,
          },
        },
        select: {
          issuedAt: true,
          paidAmount: true,
          total: true,
        },
      }),
      this.prisma.returnRequest.findMany({
        where: {
          tenantId,
          status: ReturnRequestStatus.COMPLETED,
          completedAt: {
            gte: seriesStart,
          },
        },
        select: {
          completedAt: true,
          refundAmount: true,
        },
      }),
    ]);

    const lowStockProductsList = productsForStock.filter(
      (product) => product.stock - product.reservedStock <= product.minStock,
    );
    const recentInventoryAlerts = lowStockProductsList.slice(0, 5);
    const grossSalesMonth = this.sumInvoicePaidAmount(invoicesForMonth);
    const grossSalesToday = this.sumInvoicePaidAmount(invoicesForToday);
    const refundsMonth = this.decimalToNumber(returnsMonth._sum.refundAmount);
    const refundsToday = this.decimalToNumber(returnsToday._sum.refundAmount);
    const netSalesMonth = grossSalesMonth - refundsMonth;
    const netSalesToday = grossSalesToday - refundsToday;
    const pendingReturnAmount = this.decimalToNumber(pendingReturnsAggregate._sum.refundAmount);

    return {
      totalBilledMonth: netSalesMonth,
      totalBilledToday: netSalesToday,
      grossSalesMonth,
      grossSalesToday,
      refundsMonth,
      refundsToday,
      netSalesMonth,
      netSalesToday,
      pendingReturnAmount,
      pendingInvoices,
      paidInvoices,
      draftInvoices,
      cancelledInvoices,
      activeCustomers,
      activeProducts,
      activeEmployees,
      openCashSessions,
      pendingOrders,
      claimedOrders,
      ordersInCashier: pendingOrders + claimedOrders,
      pendingQuotations,
      completedOrdersToday,
      pendingReturns,
      completedReturns,
      lowStockProducts: lowStockProductsList.length,
      openCashSessionDetails: openCashSessionDetails.map((session) => ({
        id: session.id,
        registerName: session.cashRegister.name,
        openedByName: session.openedBy.name,
        openingAmount: this.decimalToNumber(session.openingAmount),
        expectedCashAmount: this.calculateExpectedCashAmount(session),
        openedAt: session.openedAt,
      })),
      recentInvoices: recentInvoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name ?? 'Consumidor final',
        status: invoice.status,
        total: this.decimalToNumber(invoice.total),
        cashierName: invoice.issuedBy?.name ?? null,
        issuedAt: invoice.issuedAt,
        createdAt: invoice.createdAt,
      })),
      recentReturns: recentReturns.map((returnRequest) => ({
        id: returnRequest.id,
        status: returnRequest.status,
        reason: returnRequest.reason,
        refundAmount: this.decimalToNumber(returnRequest.refundAmount),
        invoiceId: returnRequest.invoice.id,
        invoiceNumber: returnRequest.invoice.invoiceNumber,
        requestedByName: returnRequest.requestedBy.name,
        resolvedByName: returnRequest.approvedBy?.name ?? returnRequest.rejectedBy?.name ?? null,
        createdAt: returnRequest.createdAt,
        completedAt: returnRequest.completedAt,
      })),
      recentCashMovements: recentCashMovements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: this.decimalToNumber(movement.amount),
        method: movement.method,
        reason: movement.reason,
        reference: movement.reference,
        cashierName: movement.user.name,
        registerName: movement.cashSession.cashRegister.name,
        invoiceNumber: movement.invoice?.invoiceNumber ?? null,
        createdAt: movement.createdAt,
      })),
      recentEmployeeLogs: recentEmployeeLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        amount: this.decimalToNumber(log.amount),
        employeeName: log.user.name,
        invoiceNumber: log.invoice?.invoiceNumber ?? null,
        createdAt: log.createdAt,
      })),
      fiscalSequenceAlerts: fiscalSequences
        .map((sequence) => ({
          id: sequence.id,
          documentType: sequence.documentType,
          prefix: sequence.prefix,
          nextNumber: sequence.nextNumber,
          endNumber: sequence.endNumber,
          remaining: sequence.endNumber - sequence.nextNumber + 1,
          validUntil: sequence.validUntil,
        }))
        .filter((sequence) => sequence.remaining <= 25),
      employeeSummary: {
        activeEmployees,
        openCashSessions,
      },
      recentInventoryAlerts,
      salesSeries: this.buildSalesSeries(invoicesForSeries, returnsForSeries, now),
    };
  }

  private buildSalesSeries(
    invoices: Array<{
      issuedAt: Date | null;
      paidAmount: { toNumber(): number };
      total: { toNumber(): number };
    }>,
    returns: Array<{
      completedAt: Date | null;
      refundAmount: { toNumber(): number };
    }>,
    now: Date,
  ) {
    const buckets = new Map<string, number>();

    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      buckets.set(this.monthKey(date), 0);
    }

    for (const invoice of invoices) {
      if (!invoice.issuedAt) {
        continue;
      }

      const key = this.monthKey(invoice.issuedAt);
      buckets.set(key, (buckets.get(key) ?? 0) + this.getInvoicePaidAmount(invoice));
    }

    for (const returnRequest of returns) {
      if (!returnRequest.completedAt) {
        continue;
      }

      const key = this.monthKey(returnRequest.completedAt);
      buckets.set(key, (buckets.get(key) ?? 0) - this.decimalToNumber(returnRequest.refundAmount));
    }

    return Array.from(buckets.entries()).map(([month, total]) => ({
      month,
      total,
    }));
  }

  private monthKey(date: Date) {
    return new Intl.DateTimeFormat('es-DO', {
      month: 'short',
    }).format(date);
  }

  private decimalToNumber(value: { toNumber(): number } | null | undefined) {
    return value ? value.toNumber() : 0;
  }

  private sumInvoicePaidAmount(
    invoices: Array<{ paidAmount: { toNumber(): number }; total: { toNumber(): number } }>,
  ) {
    return invoices.reduce((sum, invoice) => sum + this.getInvoicePaidAmount(invoice), 0);
  }

  private getInvoicePaidAmount(invoice: {
    paidAmount: { toNumber(): number };
    total: { toNumber(): number };
  }) {
    const paidAmount = this.decimalToNumber(invoice.paidAmount);
    return paidAmount > 0 ? paidAmount : 0;
  }

  private calculateExpectedCashAmount(session: {
    openingAmount: { toNumber(): number };
    movements: Array<{
      type: CashMovementType;
      amount: { toNumber(): number };
      method: PaymentMethod | null;
    }>;
  }) {
    const negativeMovementTypes: CashMovementType[] = [CashMovementType.CASH_OUT, CashMovementType.REFUND];

    return session.movements.reduce((sum, movement) => {
      if (movement.type === CashMovementType.CLOSING) {
        return sum;
      }

      if (movement.method && movement.method !== PaymentMethod.CASH) {
        return sum;
      }

      const amount = this.decimalToNumber(movement.amount);
      return negativeMovementTypes.includes(movement.type) ? sum - amount : sum + amount;
    }, this.decimalToNumber(session.openingAmount));
  }
}
