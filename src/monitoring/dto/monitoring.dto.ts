import { IsOptional, IsInt, IsString, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MonitoringQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) per_page?: number = 50;
  @ApiPropertyOptional() @IsOptional() @IsString() from_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to_date?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) user_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ip_address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endpoint?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() status_code?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() severity?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) errors_only?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) suspicious_only?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class BlockIpDto {
  @IsString() ip_address: string;
  @IsString() reason: string;
  @IsOptional() @IsString() expires_at?: string;
}

export class ExportQueryDto extends MonitoringQueryDto {
  @ApiPropertyOptional({ enum: ['api_logs', 'auth_logs', 'activity_logs', 'error_logs', 'security_events'] })
  @IsOptional()
  @IsIn(['api_logs', 'auth_logs', 'activity_logs', 'error_logs', 'security_events'])
  type?: string = 'api_logs';
}
