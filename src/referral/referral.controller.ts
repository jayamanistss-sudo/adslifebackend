import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReferralService } from './referral.service';

class ApplyReferralDto {
  @ApiProperty({ example: 'ADS7K9XQP2' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;
}

@ApiTags('referral')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('my')
  async my(@CurrentUser() user: any) {
    const data = await this.referralService.getMyReferral(user.user_id);
    return { success: true, data };
  }

  // General-purpose apply endpoint — the vendor-application flow calls
  // applyReferral() directly in-process instead of round-tripping through
  // this, but this exists for any other "enter a referral code" surface
  // (e.g. a Settings page) without needing its own bespoke wiring.
  @Post('apply')
  async apply(@CurrentUser() user: any, @Body() dto: ApplyReferralDto) {
    await this.referralService.applyReferral(user.user_id, dto.code.toUpperCase());
    const data = await this.referralService.getMyReferral(user.user_id);
    return { success: true, data };
  }
}
