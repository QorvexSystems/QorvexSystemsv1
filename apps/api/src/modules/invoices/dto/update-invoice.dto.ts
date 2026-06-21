import { InvoiceStatus } from '@qorvex/database';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
