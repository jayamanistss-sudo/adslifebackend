import { IsEmail, IsString, IsOptional, IsNumber, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@adslife.in', description: 'Registered email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password', description: 'Account password' })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({ example: 13.0827, description: 'Device latitude' })
  @IsOptional() @Type(() => Number) @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 80.2707, description: 'Device longitude' })
  @IsOptional() @Type(() => Number) @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional() @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 15.5, description: 'GPS accuracy in metres' })
  @IsOptional() @Type(() => Number) @IsNumber()
  accuracy?: number;
}
