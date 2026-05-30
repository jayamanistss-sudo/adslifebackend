import {
  IsArray, IsOptional, IsNumber, IsString, Min, Max,
  ArrayMaxSize, IsLatitude, IsLongitude,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveAreaQueryDto {
  @ApiPropertyOptional({ example: '13.0827' })
  @IsOptional()
  @IsString()
  lat?: string;

  @ApiPropertyOptional({ example: '80.2707' })
  @IsOptional()
  @IsString()
  lng?: string;
}

export class SetTargetingDto {
  @ApiPropertyOptional({ example: ['Food', 'Fashion'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  categories?: string[] = [];

  @ApiPropertyOptional({ example: 15, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  max_distance_km?: number = 15;

  @ApiPropertyOptional({ example: [1, 2, 3] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @ArrayMaxSize(50)
  preferred_vendors?: number[] = [];
}
