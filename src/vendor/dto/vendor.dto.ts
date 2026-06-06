import {
  IsString, IsOptional, IsNumber, IsUrl, IsLatitude, IsLongitude,
  MaxLength, MinLength, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class UpdateVendorProfileDto {
  @ApiPropertyOptional({ example: 'My Bakery' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  business_name?: string;

  @ApiPropertyOptional({ example: 'food-dining' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: '12, Anna Nagar, Chennai - 600040' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]{7,15}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://saibakery.in' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'Freshly baked goods delivered daily in Chennai.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.adslife.in/logos/sai-bakery.png' })
  @IsOptional()
  @IsUrl()
  logo_url?: string;

  @ApiPropertyOptional({ example: 13.0827 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 80.2707 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: '29ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gst_number?: string;
}

export class VendorDashboardQueryDto {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  days?: number = 30;
}
