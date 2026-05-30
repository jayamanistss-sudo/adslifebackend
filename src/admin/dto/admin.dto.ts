import {
  IsString, IsOptional, IsIn, IsInt, Min,
  IsNotEmpty, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['user', 'vendor', 'admin', ''] })
  @IsOptional() @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'banned', ''] })
  @IsOptional() @IsString()
  status?: string;
}

export class AdminVendorQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['pending_review', 'approved', 'rejected', 'suspended', ''] })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  plan?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}

export class AdminOffersQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'expired', ''] })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}

export class ReviewVendorDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsString()
  @IsIn(['approved', 'rejected'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BroadcastDto {
  @ApiProperty({ example: 'New offers near you!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: 'Check out today\'s best deals.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ example: { type: 'general' } })
  @IsOptional()
  data?: Record<string, string>;
}

export class SiteSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  app_name?: string;

  @ApiPropertyOptional({ enum: ['0', '1'] })
  @IsOptional()
  @IsIn(['0', '1'])
  maintenance_mode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  min_app_version?: string;

  @ApiPropertyOptional({ enum: ['0', '1'] })
  @IsOptional()
  @IsIn(['0', '1'])
  coins_enabled?: string;

  @ApiPropertyOptional({ enum: ['0', '1'] })
  @IsOptional()
  @IsIn(['0', '1'])
  spin_enabled?: string;
}
