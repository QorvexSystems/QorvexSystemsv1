import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class OpenCashSessionDto {
  @IsString()
  cashRegisterId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingAmount: number;
}
