import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType } from '@qorvex/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findMovements(tenantId: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { tenantId },
      include: {
        product: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });
  }

  async createMovement(tenantId: string, userId: string, dto: CreateInventoryMovementDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        tenantId,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found for tenant.');
    }

    const signedQuantity = this.getSignedQuantity(dto.type, dto.quantity);

    const movement = await this.prisma.$transaction(async (tx) => {
      const previousStock = product.stock;
      const newStock = previousStock + signedQuantity;

      if (newStock < 0) {
        throw new BadRequestException('Inventory movement would leave product stock below zero.');
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          type: dto.type,
          quantity: dto.quantity,
          previousStock,
          newStock,
          unitCost: product.cost,
          reason: dto.reason,
          reference: dto.reference,
          createdById: userId,
        },
      });

      await tx.product.update({
        where: { id: dto.productId },
        data: {
          stock: newStock,
        },
      });

      return movement;
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'INVENTORY_MOVEMENT_CREATED',
      entity: 'InventoryMovement',
      entityId: movement.id,
      metadata: {
        productId: dto.productId,
        type: dto.type,
        quantity: dto.quantity,
        reference: dto.reference,
      },
    });

    return movement;
  }

  private getSignedQuantity(type: InventoryMovementType, quantity: number) {
    const negativeMovementTypes: InventoryMovementType[] = [
        InventoryMovementType.OUTBOUND,
        InventoryMovementType.SALE,
        InventoryMovementType.ADJUSTMENT_OUT,
        InventoryMovementType.DAMAGE,
        InventoryMovementType.TRANSFER_OUT,
      ];

    if (negativeMovementTypes.includes(type)) {
      return -quantity;
    }

    return quantity;
  }
}
