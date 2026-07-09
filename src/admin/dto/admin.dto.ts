import {
  IsString, IsOptional, IsIn, IsInt, Min, IsArray, ArrayMinSize,
  IsNotEmpty, MaxLength, IsNumber,
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

export class BulkVendorPlanDto {
  @ApiProperty({
    type: [Number],
    example: [1, 2, 5],
    description: 'List of vendor IDs to update',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  vendor_ids: number[];

  @ApiProperty({
    example: 'starter',
    description: 'Plan slug to assign to all listed vendors',
  })
  @IsString()
  @IsNotEmpty()
  plan: string;
}

export class AdminVendorActionDto {
  @ApiProperty({
    enum: ['approve', 'reject', 'suspend', 'update_plan'],
    example: 'update_plan',
    description: 'Action to perform on the vendor',
  })
  @IsString()
  @IsIn(['approve', 'reject', 'suspend', 'update_plan'])
  action: string;

  @ApiPropertyOptional({
    enum: ['free', 'starter', 'professional', 'enterprise'],
    example: 'starter',
    description: 'Required when action = update_plan',
  })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ example: 'Violation of terms', description: 'Optional note for reject/suspend' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminUserActionDto {
  @ApiProperty({
    enum: ['ban', 'unban', 'delete', 'update_role'],
    example: 'update_role',
    description: 'Action to perform on the user',
  })
  @IsString()
  @IsIn(['ban', 'unban', 'delete', 'update_role'])
  action: string;

  @ApiPropertyOptional({
    enum: ['user', 'vendor', 'admin'],
    example: 'vendor',
    description: 'Required when action = update_role',
  })
  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateAdminRoleDto {
  @ApiProperty({
    enum: ['support', 'moderator', 'super', ''],
    example: 'moderator',
    description: 'Admin sub-role to grant. Empty string revokes admin sub-role (demotes to a plain admin with no elevated scope).',
  })
  @IsString()
  @IsIn(['support', 'moderator', 'super', ''])
  admin_role: string;
}

export class AdminOfferActionDto {
  @ApiProperty({
    enum: ['activate', 'deactivate', 'delete', 'feature'],
    example: 'activate',
    description: 'Action to perform on the offer',
  })
  @IsString()
  @IsIn(['activate', 'deactivate', 'delete', 'feature'])
  action: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Required when action = feature. 1 = featured, 0 = unfeatured',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  featured?: number;
}

export class SiteSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() app_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() site_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() site_tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() site_logo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seo_title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seo_description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seo_keywords?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contact_email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contact_phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() min_app_version?: string;
  @ApiPropertyOptional({ enum: ['0', '1'] }) @IsOptional() @IsIn(['0', '1']) maintenance_mode?: string;
  @ApiPropertyOptional({ enum: ['0', '1'] }) @IsOptional() @IsIn(['0', '1']) coins_enabled?: string;
  @ApiPropertyOptional({ enum: ['0', '1'] }) @IsOptional() @IsIn(['0', '1']) spin_enabled?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms_content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() privacy_content?: string;
}
