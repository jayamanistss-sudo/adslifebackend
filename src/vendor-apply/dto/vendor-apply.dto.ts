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

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @Matches(/^[+\d\s\-()]{7,20}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsUrl({}, { message: 'website must be a valid URL' })
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(20)
  gst_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  logo_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  plan_id?: number;
}
