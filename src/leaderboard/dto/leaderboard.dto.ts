import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardQueryDto {
  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: ['weekly', 'monthly', 'alltime'], default: 'monthly' })
  @IsOptional()
  @IsString()
  @IsIn(['weekly', 'monthly', 'alltime'])
  period?: string = 'monthly';

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
