import { IsString, IsOptional, IsNumber, IsInt, Min, IsArray } from 'class-validator';
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  coupon_code?: string;

  @IsOptional()
  @IsString()
  redeem_url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
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
