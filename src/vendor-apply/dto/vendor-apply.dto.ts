import {
  IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength, Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Convert empty strings to undefined so @IsOptional() skips further validation
const emptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

export class SubmitVendorApplicationDto {
  @ApiProperty({ example: 'Sai Bakery' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  business_name: string;

  @ApiPropertyOptional({ example: 'Food & Dining' })
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

  @ApiPropertyOptional({ example: '123, Anna Salai, Chennai' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: '+91 9876543210' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @Matches(/^[+\d\s\-()]{7,20}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://mybakery.com' })
  @IsOptional()
  @emptyToUndefined()
  @IsUrl({}, { message: 'website must be a valid URL (e.g. https://mybakery.com)' })
  website?: string;

  @ApiPropertyOptional({ example: '22AAAAA0000A1Z5' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(20)
  gst_number?: string;

  @ApiPropertyOptional({ example: 'We have been baking for 10 years.' })
  @IsOptional()
  @emptyToUndefined()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
