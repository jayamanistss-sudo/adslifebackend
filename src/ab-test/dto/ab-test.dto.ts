import {
  IsString, IsNotEmpty, IsInt, IsOptional, IsObject, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAbTestDto {
  @ApiProperty({ example: 'Summer sale headline test' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offer_id_a: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offer_id_b: number;

  @ApiPropertyOptional({ example: 14, default: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration_days?: number = 14;
}

export class ConcludeAbTestDto {
  @ApiProperty({ enum: ['A', 'B'] })
  @IsString()
  @IsNotEmpty()
  winner: 'A' | 'B';
}
