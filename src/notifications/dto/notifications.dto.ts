import {
  IsString, IsOptional, IsIn, IsInt,
  IsNotEmpty, MaxLength, Min,
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

export class TriggerNotificationDto {
  @ApiProperty({ description: 'Single user ID or array of user IDs' })
  user_ids: number | number[];

  @ApiProperty({ example: 'You have a new offer!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: 'Check out the latest deals near you.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ example: { type: 'offer', offer_id: '42' } })
  @IsOptional()
  data?: Record<string, string>;
}
