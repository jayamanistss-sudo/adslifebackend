import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ example: 'Cannot upload offer image' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'When I try to upload an image, I get a 500 error.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ enum: ['general', 'billing', 'technical', 'account'], default: 'general' })
  @IsOptional()
  @IsString()
  @IsIn(['general', 'billing', 'technical', 'account'])
  category?: string = 'general';
}

export class ReplyTicketDto {
  @ApiProperty({ example: 'Thank you for reaching out. We will look into this.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
