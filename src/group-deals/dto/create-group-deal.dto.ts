import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Was a plain inline object type — min_members/max_members/duration_hours
// had no bounds at all (e.g. a negative or zero min_members, or a negative
// duration that creates an already-expired deal).
export class CreateGroupDealDto {
  @ApiProperty({ example: 42 })
  @Type(() => Number)
  @IsInt()
  offer_id: number;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(1000)
  min_members: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(1000)
  max_members?: number;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  duration_hours?: number;
}
