import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ example: 'Cannot upload offer image' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'When I try to upload an image, I get a 500 error.' })
  // Clients send the body as "message" or (legacy) "description" — accept both.
  @Transform(({ value, obj }) => value ?? obj.description)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ enum: ['general', 'billing', 'technical', 'account', 'offer', 'other'], default: 'general' })
  @Transform(({ value }) => value ?? 'general')
  @IsOptional()
  @IsString()
  @IsIn(['general', 'billing', 'technical', 'account', 'offer', 'other'])
  category?: string = 'general';

  // The vendor-facing create form already collects this but previously
  // discarded it client-side ("priority is display-only, not stored").
  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;
}

export class ReplyTicketDto {
  @ApiProperty({ example: 'Thank you for reaching out. We will look into this.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  // Neither field previously existed on this DTO — the global ValidationPipe
  // whitelist silently stripped them even when the admin UI posted them, so
  // an admin's chosen status/priority never actually persisted.
  @ApiPropertyOptional({ enum: ['open', 'answered', 'closed'] })
  @IsOptional()
  @IsString()
  @IsIn(['open', 'answered', 'closed'])
  status?: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'urgent'] })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;
}
