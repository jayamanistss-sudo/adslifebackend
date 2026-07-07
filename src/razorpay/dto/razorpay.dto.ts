import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RazorpayCreateOrderDto {
  @ApiProperty({ example: 50000, description: 'Amount in paise (min 100 = ₹1)' })
  @Type(() => Number)
  @IsInt()
  @Min(100, { message: 'amount must be at least 100 paise (₹1)' })
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

export class RazorpayVerifyDto {
  @ApiProperty({ example: 'order_Nxxxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  razorpay_order_id: string;

  @ApiProperty({ example: 'pay_Nxxxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  razorpay_payment_id: string;

  @ApiProperty({ example: 'generated_signature_hex' })
  @IsString()
  @IsNotEmpty()
  razorpay_signature: string;
}
