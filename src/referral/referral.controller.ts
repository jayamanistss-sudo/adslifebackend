import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReferralService } from './referral.service';

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
}
