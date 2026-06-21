import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be exactly 10 digits' })
  phone: string;

  @ApiProperty({ example: 'Chennai' })
  @IsString()
  @Matches(/^[A-Za-z\s]{2,}$/, { message: 'city must be at least 2 letters' })
  city: string;

  @ApiPropertyOptional({ example: 'REF123', description: 'Referral code' })
  @IsOptional()
  @IsString()
  ref?: string;
}
