import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
