import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH, PASSWORD_COMPLEXITY_REGEX, PASSWORD_POLICY_MESSAGE } from '../../common/constants/password-policy';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Passw0rd!', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
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
