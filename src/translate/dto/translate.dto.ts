import { IsInt, IsOptional, IsString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const LANG_CODES = ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa'];

export class TranslateOfferDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offer_id: number;

  @ApiPropertyOptional({ enum: LANG_CODES, default: 'hi' })
  @IsOptional()
  @IsString()
  @IsIn(LANG_CODES)
  target_lang?: string = 'hi';
}
