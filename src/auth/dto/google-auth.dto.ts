import { IsString, IsOptional, IsNotEmpty, IsNumber, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GoogleAuthDto {
  @ApiProperty({ example: 'ya29.a0AfH6SMB...' })
  @IsString()
  @IsNotEmpty()
  access_token: string;

  @ApiPropertyOptional({ example: 'com.adslife.app://auth' })
  @IsOptional()
  @IsString()
  app_uri?: string;
}

export class BecomeVendorDto {
  @ApiProperty({ example: 'Sai Bakery' })
  @IsString()
  @IsNotEmpty()
  business_name: string;

  @ApiPropertyOptional({ example: 'Food & Dining' })
  @IsOptional()
  @IsString()
  category?: string;

  // The mobile app's category picker sends this field name instead of
  // `category` — accepted as an alias so the value isn't silently dropped
  // by the global whitelist ValidationPipe.
  @ApiPropertyOptional({ example: 'food-dining', description: 'Alias for category, used by the mobile app' })
  @IsOptional()
  @IsString()
  business_type?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '+91 9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '12, Anna Nagar, Chennai - 600040' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 13.0827 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 80.2707 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: 'https://saibakery.in' })
  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  website?: string;

  @ApiPropertyOptional({ example: '29ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  gst_number?: string;

  @ApiPropertyOptional({ example: 'Freshly baked goods delivered daily in Chennai.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.adslife.in/logos/sai-bakery.png' })
  @IsOptional()
  @IsString()
  logo_url?: string;

  @ApiPropertyOptional({ example: 6, description: 'Requested subscription plan ID from GET /plans — admin confirms it on review' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  plan_id?: number;
}
