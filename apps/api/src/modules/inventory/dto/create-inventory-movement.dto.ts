import { InventoryMovementType } from '@qorvex/database';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInventoryMovementDto {
  @IsString()
  productId: string;

  @IsEnum(InventoryMovementType)
  type: InventoryMovementType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
