import { IsInt, IsOptional, IsString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackShareDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offer_id: number;

  @ApiPropertyOptional({ enum: ['whatsapp', 'facebook', 'twitter', 'instagram', 'general'], default: 'general' })
  @IsOptional()
  @IsString()
  @IsIn(['whatsapp', 'facebook', 'twitter', 'instagram', 'general'])
  platform?: string = 'general';
}
