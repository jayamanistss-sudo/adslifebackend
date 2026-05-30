import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '+91 9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;
}
