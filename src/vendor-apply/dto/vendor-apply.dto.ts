import { IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength, Matches, IsNumber } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const emptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

export class SubmitVendorApplicationDto {
  @ApiProperty({ example: 'Sai Bakery' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  business_name: string;

  @ApiPropertyOptional({ example: 'food-dining' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: '12, Anna Nagar, Chennai - 600040' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @Matches(/^[+\d\s\-()]{7,20}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://saibakery.in' })
  @IsOptional()
  @emptyToUndefined()
  @IsUrl({}, { message: 'website must be a valid URL' })
  website?: string;

  @ApiPropertyOptional({ example: '29ABCDE1234F1Z5' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(20)
  gst_number?: string;

  @ApiPropertyOptional({ example: 'Freshly baked goods delivered daily in Chennai.' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(1000)
  description?: string;

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

  @ApiPropertyOptional({ example: 'https://cdn.adslife.in/logos/sai-bakery.png' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  logo_url?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID of the subscription plan (optional)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  plan_id?: number;
}
