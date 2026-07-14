import {
  IsString, IsOptional, IsNumber, IsUrl, IsLatitude, IsLongitude,
  MaxLength, MinLength, Matches, IsObject,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  @Matches(/^(\+91[\s-]?)?[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit mobile number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://saibakery.in' })
  // Clients send '' when the field is cleared — map to null so @IsUrl()
  // doesn't reject it and the service clears the stored value.
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'Freshly baked goods delivered daily in Chennai.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.adslife.in/logos/sai-bakery.png' })
  @Transform(({ value }) => (value === '' ? null : value))
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

  @ApiPropertyOptional({
    example: { mon: { open: '09:00', close: '21:00', closed: false } },
  })
  @IsOptional()
  @IsObject()
  hours?: Record<string, { open: string; close: string; closed: boolean }>;
}

export class VendorDashboardQueryDto {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  days?: number = 30;
}
