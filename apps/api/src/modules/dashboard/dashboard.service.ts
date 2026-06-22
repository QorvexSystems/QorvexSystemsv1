import { Injectable } from '@nestjs/common';
import {
  CashSessionStatus,
  CustomerStatus,
  EmployeeStatus,
  FiscalSequenceStatus,
  InvoiceStatus,
  ProductStatus,
} from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';

const billedStatuses = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PAID,
  InvoiceStatus.PENDING_ECF,
  InvoiceStatus.ACCEPTED,
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
      totalBilledMonth,
      totalBilledToday,
      pendingInvoices,
      paidInvoices,
      draftInvoices,
      cancelledInvoices,
      activeCustomers,
      activeProducts,
      activeEmployees,
      openCashSessions,
      recentInvoices,
      recentCashMovements,
      recentEmployeeLogs,
      fiscalSequences,
      productsForStock,
      invoicesForSeries,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: { in: billedStatuses },
          issuedAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        _sum: { total: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: { in: billedStatuses },
          issuedAt: {
            gte: todayStart,
          },
        },
        _sum: { total: true },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PENDING_ECF] },
        },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          status: InvoiceStatus.PAID,
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
      this.prisma.invoice.findMany({
        where: { tenantId },
        include: {
          customer: true,
          issuedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
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
          status: { in: billedStatuses },
          issuedAt: {
            gte: seriesStart,
          },
        },
        select: {
          issuedAt: true,
          total: true,
        },
      }),
    ]);

    const recentInventoryAlerts = productsForStock
      .filter((product) => product.stock - product.reservedStock <= product.minStock)
      .slice(0, 5);

    return {
      totalBilledMonth: this.decimalToNumber(totalBilledMonth._sum.total),
      totalBilledToday: this.decimalToNumber(totalBilledToday._sum.total),
      pendingInvoices,
      paidInvoices,
      draftInvoices,
      cancelledInvoices,
      activeCustomers,
      activeProducts,
      activeEmployees,
      openCashSessions,
      lowStockProducts: recentInventoryAlerts.length,
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
      salesSeries: this.buildSalesSeries(invoicesForSeries, now),
    };
  }

  private buildSalesSeries(
    invoices: Array<{ issuedAt: Date | null; total: { toNumber(): number } }>,
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
      buckets.set(key, (buckets.get(key) ?? 0) + this.decimalToNumber(invoice.total));
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
}
