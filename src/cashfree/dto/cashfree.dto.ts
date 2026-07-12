import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CashfreeCreateOrderDto {
  @ApiProperty({ example: 199, description: 'Amount in rupees (min ₹1)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'amount must be at least ₹1' })
  amount: number;

  @ApiPropertyOptional({ example: 'INR', default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'plan_growth_2026' })
  @IsOptional()
  @IsString()
  receipt?: string;
}

export class CashfreeVerifyDto {
  @ApiProperty({ example: 'adslife_u42_1735689600000' })
  @IsString()
  @IsNotEmpty()
  order_id: string;
}
