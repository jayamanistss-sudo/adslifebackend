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

  // Previously "Actioned" only flipped this flag's own status column — the
  // vendor/offer it was about was never actually touched, so an admin had to
  // separately navigate to the relevant list and act a second time.
  @ApiPropertyOptional({ enum: ['suspend_vendor', 'deactivate_offer'] })
  @IsOptional()
  @IsString()
  @IsIn(['suspend_vendor', 'deactivate_offer'])
  downstream_action?: string;
}
