import { IsNumber, IsOptional, IsString, IsIn, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class FeedQueryDto {
  @ApiPropertyOptional({ default: 13.0827 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number = 13.0827;

  @ApiPropertyOptional({ default: 80.2707 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number = 80.2707;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}

export class TrendingQueryDto extends FeedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;
}

export class NearbyQueryDto extends FeedQueryDto {
  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radius?: number = 10;
}

export class InteractionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offer_id: number;

  @ApiProperty({ enum: ['view', 'click', 'save', 'redeem', 'share', 'skip'] })
  @IsString()
  @IsIn(['view', 'click', 'save', 'redeem', 'share', 'skip'])
  action: string;
}

export class SavedQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}
