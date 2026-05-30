import {
  IsString, IsNotEmpty, IsOptional, IsIn, IsInt, IsUrl, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestBannerAdDto {
  @ApiProperty({ example: 'https://cdn.example.com/banner.jpg' })
  @IsUrl()
  @IsNotEmpty()
  image_url: string;

  @ApiProperty({ example: 'https://example.com/offer' })
  @IsUrl()
  @IsNotEmpty()
  target_url: string;

  @ApiPropertyOptional({ enum: ['top', 'bottom', 'sidebar'], default: 'top' })
  @IsOptional()
  @IsString()
  @IsIn(['top', 'bottom', 'sidebar'])
  position?: string = 'top';

  @ApiPropertyOptional({ example: 7, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  duration_days?: number = 7;
}

export class ReviewBannerAdDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsString()
  @IsIn(['approved', 'rejected'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
