import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DocumentType, SalesOrderDestination } from '@qorvex/database';

export class SalesOrderItemDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;
}

export class CreateSalesOrderDto {
  @IsEnum(SalesOrderDestination)
  destination: SalesOrderDestination;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientName?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  quotationDocumentType?: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  quotationDocumentNumber?: string;

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
