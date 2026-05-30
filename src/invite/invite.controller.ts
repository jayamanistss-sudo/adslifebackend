import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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

  @Post('email')
  async sendEmail(@CurrentUser() user: any, @Body() dto: SendInviteDto) {
    await this.inviteService.sendInviteEmail(user.user_id, dto.email, dto.offer_id, dto.message);
    return { success: true, message: 'Invite sent!' };
  }
}
