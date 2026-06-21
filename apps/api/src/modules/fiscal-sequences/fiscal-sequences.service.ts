import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FiscalSequencesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.fiscalSequence.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { documentType: 'asc' }],
    });
  }
}
