import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FraudReviewDto {
  @ApiProperty({ enum: ['resolved', 'false_positive', 'actioned'] })
  @IsString()
  @IsIn(['resolved', 'false_positive', 'actioned'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
