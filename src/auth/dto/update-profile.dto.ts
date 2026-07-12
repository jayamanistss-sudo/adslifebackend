import { IsString, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Was a plain inline object type — no length/format bounds at all. The
// service layer already whitelists which keys get persisted (no
// mass-assignment risk), but nothing stopped e.g. an arbitrarily long
// string being written into `name`/`avatar_url`.
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be exactly 10 digits' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatar_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email_alerts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;
}
