import { IsString, IsOptional, IsNumber, IsInt, Min, Max, IsArray, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOfferDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  // Previously unbounded — a direct API call could attach unlimited images.
  // The vendor form already caps this at 5 client-side only.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  coupon_code?: string;

  @IsOptional()
  @IsString()
  redeem_url?: string;

  // Previously unbounded — a direct API call could create a negative or
  // 500% "discount"; a fraud rule flagged >80% as suspicious but never
  // blocked it. This is a hard sanity ceiling, not the fraud threshold.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_percent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  original_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offer_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_redemptions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  coins_required?: number;

  @IsOptional()
  @IsString()
  valid_from?: string;

  @IsOptional()
  @IsString()
  valid_until?: string;
}

export class UpdateOfferDto extends CreateOfferDto {
  @IsOptional()
  is_active?: boolean;
}
