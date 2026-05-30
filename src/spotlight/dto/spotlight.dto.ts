import {
  IsInt, IsOptional, IsString, IsIn, MaxLength, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class RequestSpotlightDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offer_id?: number;

  @ApiPropertyOptional({ example: 'Looking for prime visibility this weekend.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({ example: 7, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  duration_days?: number = 7;
}

export class ApproveSpotlightDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsString()
  @IsIn(['approved', 'rejected'])
  status: string;

  @ApiPropertyOptional({ example: 7, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  duration_days?: number = 7;
}
