import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, IsOptional, IsInt } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InviteService } from './invite.service';

export class SendInviteDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsInt()
  offer_id?: number;
}

@ApiTags('invite')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('invite')
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  // Previously no rate limit at all — unlike every other outbound-email
  // action in the app (e.g. admin broadcast), one account could spam-send
  // invite emails to arbitrary addresses indefinitely.
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('email')
  async sendEmail(@CurrentUser() user: any, @Body() dto: SendInviteDto) {
    await this.inviteService.sendInviteEmail(user.user_id, dto.email, dto.offer_id, dto.message);
    return { success: true, message: 'Invite sent!' };
  }
}
