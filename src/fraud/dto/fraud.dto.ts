import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FraudReviewDto {
  // These previously didn't match FraudFlagStatus ('pending'|'reviewed'|
  // 'dismissed') at all — every review call was failing the DB write with
  // an invalid-enum-value error, silently surfaced to the admin as a
  // generic 500. The downstream action (this session's fix) still applied
  // before this write, so the flag itself just never actually got marked
  // reviewed.
  @ApiProperty({ enum: ['reviewed', 'dismissed'] })
  @IsString()
  @IsIn(['reviewed', 'dismissed'])
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
