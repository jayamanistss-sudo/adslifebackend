import { IsLatitude, IsLongitude, IsOptional, IsString, IsNumber, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Was a plain inline object type with manual range-checking in the
// controller body — moved into decorators so the ValidationPipe rejects
// bad input before the handler runs, same as every other DTO in this app.
export class UpdateLocationDto {
  @ApiProperty({ example: 13.0827 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 80.2707 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;

  @ApiPropertyOptional({ example: 'gps' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  source?: string;
}
