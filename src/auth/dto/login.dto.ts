import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@adslife.in', description: 'Registered email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password', description: 'Account password' })
  @IsString()
  @MinLength(1)
  password: string;
}
