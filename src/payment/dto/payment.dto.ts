import { IsInt, IsOptional, IsString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  plan_id: number;

  @ApiPropertyOptional({ enum: ['vendor_plan', 'boost', 'spotlight'], default: 'vendor_plan' })
  @IsOptional()
  @IsString()
  @IsIn(['vendor_plan', 'boost', 'spotlight'])
  purpose?: string = 'vendor_plan';

  @ApiPropertyOptional({ enum: ['monthly', 'annual'], default: 'monthly' })
  @IsOptional()
  @IsString()
  @IsIn(['monthly', 'annual'])
  billing_cycle?: 'monthly' | 'annual' = 'monthly';
}

export class VerifyPaymentQueryDto {
  @ApiProperty({ example: 'order_abc123' })
  @IsString()
  order_id: string;
}
