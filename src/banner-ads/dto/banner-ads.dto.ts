import {
  IsString, IsNotEmpty, IsOptional, IsIn, IsInt, IsUrl, Min, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestBannerAdDto {
  @ApiProperty({ example: 'Summer Sale Banner' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({ example: 'https://cdn.example.com/banner.jpg' })
  @IsUrl()
  @IsNotEmpty()
  image_url: string;

  @ApiPropertyOptional({ enum: ['image', 'video'], default: 'image' })
  @IsOptional()
  @IsString()
  @IsIn(['image', 'video'])
  media_type?: string = 'image';

  @ApiProperty({ example: 'https://example.com/offer' })
  @IsUrl()
  @IsNotEmpty()
  target_url: string;

  @ApiProperty({ example: 1, description: 'Banner plan ID — determines duration and price' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  banner_plan_id: number;
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
