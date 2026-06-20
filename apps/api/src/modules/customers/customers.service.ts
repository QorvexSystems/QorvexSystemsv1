import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus } from '@qorvex/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(tenantId: string) {
    return this.prisma.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        ...dto,
        tenantId,
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'CUSTOMER_CREATED',
      entity: 'Customer',
      entityId: customer.id,
      metadata: { name: customer.name, documentNumber: customer.documentNumber },
    });

    return customer;
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for tenant.');
    }

    return customer;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(tenantId, id);

    const customer = await this.prisma.customer.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'CUSTOMER_UPDATED',
      entity: 'Customer',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return customer;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        status: CustomerStatus.INACTIVE,
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'CUSTOMER_DEACTIVATED',
      entity: 'Customer',
      entityId: id,
    });

    return customer;
  }
}
