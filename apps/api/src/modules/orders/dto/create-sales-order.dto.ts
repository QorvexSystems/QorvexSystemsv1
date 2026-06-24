import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SalesOrderItemDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;
}

export class CreateSalesOrderDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items: SalesOrderItemDto[];
}

export class ClaimSalesOrderDto {
  @IsOptional()
  @IsString()
  cashSessionId?: string;
}

export class CancelSalesOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
