import {
  IsString, IsOptional, IsIn, IsInt,
  IsNotEmpty, MaxLength, Min, IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveTokenDto {
  @ApiPropertyOptional({ example: 'fcm-device-token-here' })
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  @IsString()
  token?: string;

  @ApiPropertyOptional({ enum: ['android', 'ios', 'web'], default: 'web' })
  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios', 'web'])
  platform?: string = 'web';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  device_info?: string;
}

export class MarkReadDto {
  @ApiPropertyOptional({ description: 'Notification ID. Omit to mark all as read.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;
}

export class NotificationsListQueryDto {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 30;
}

export class CreateTemplateDto {
  @ApiProperty({ enum: ['morning','lunch','evening','dinner','goodnight','weekend','reengage','personalized_search','interest_alert'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['morning','lunch','evening','dinner','goodnight','weekend','reengage','personalized_search','interest_alert'])
  type!: string;

  @ApiProperty({ example: '🌅 Good Morning! Offers வந்திருக்கு' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @ApiProperty({ example: 'இன்றைய best deals check பண்ணுங்க! 🎁' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ default: '/feed' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  route?: string;

  @ApiPropertyOptional({ default: 'ta' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsIn(['morning','lunch','evening','dinner','goodnight','weekend','reengage','personalized_search'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  is_active?: boolean;
}

export class TriggerNotificationDto {
  @ApiProperty({ description: 'Array of user IDs' })
  @IsArray()
  @IsInt({ each: true })
  user_ids!: number[];

  @ApiProperty({ example: 'You have a new offer!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiProperty({ example: 'Check out the latest deals near you.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body!: string;

  @ApiPropertyOptional({ example: { type: 'offer', offer_id: '42' } })
  @IsOptional()
  data?: Record<string, string>;
}
