import { IsString, IsOptional, IsNotEmpty, IsNumber, IsInt, Min, Max, IsArray, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

// These 9 fields were previously all-optional here even though both web's
// ManageOffers.tsx and mobile's manage_offers_screen.dart already require
// every one of them client-side (identically) before allowing submit — a
// direct API call could create a near-empty offer with no image, price, or
// dates. Codifying what both frontends already agree is required.
export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  image_url: string;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_percent: number;

  @Type(() => Number)
  @IsNumber()
  original_price: number;

  @Type(() => Number)
  @IsNumber()
  offer_price: number;

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

  @IsString()
  @IsNotEmpty()
  valid_from: string;

  @IsString()
  @IsNotEmpty()
  valid_until: string;
}

// Every field optional for updates (a toggle-only PATCH-style request
// shouldn't have to resend the whole offer) — offers.service.ts's update()
// already treats every field as independently optional via `!== undefined`
// checks, this just makes the DTO's validation agree with that.
export class UpdateOfferDto extends PartialType(CreateOfferDto) {
  @IsOptional()
  is_active?: boolean;
}
