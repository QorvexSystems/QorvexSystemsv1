import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmployeeLogsService {
  constructor(private readonly prisma: PrismaService) {}

  findRecent(tenantId: string) {
    return this.prisma.employeeActivityLog.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true } },
        cashSession: { include: { cashRegister: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }
}
