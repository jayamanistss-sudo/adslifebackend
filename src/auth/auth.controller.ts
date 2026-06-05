import {
  Controller, Post, Put, Body, Get, Query,
  UseGuards, HttpCode, HttpStatus, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthDto, BecomeVendorDto } from './dto/google-auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

function reqCtx(req: Request) {
  const fwd = req.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : (req.ip ?? '0.0.0.0');
  return { ip, ua: req.get('user-agent') ?? '', requestId: (req as any).requestId };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const data = await this.authService.login(dto, reqCtx(req));
    return { success: true, data, message: 'Login successful' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const data = await this.authService.register(dto, reqCtx(req));
    return { success: true, data, message: 'Registration successful' };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(@Body() dto: GoogleAuthDto) {
    const data = await this.authService.googleAuth(dto.access_token);
    return { success: true, data, message: 'Google auth successful' };
  }

  @Public()
  @Get('google-web')
  googleWebRedirect(@Query('app_uri') appUri: string = 'com.adslife.app://auth') {
    const allowedPrefixes = ['com.adslife.app://', 'exp://'];
    const safe = allowedPrefixes.some(p => appUri.startsWith(p));
    if (!safe) return { error: 'Invalid app_uri' };

    const state = Buffer.from(
      JSON.stringify({ app_uri: appUri, n: Math.random().toString(36) }),
    ).toString('base64');

    const url =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID    || '',
        redirect_uri:  process.env.GOOGLE_CALLBACK_URI || '',
        response_type: 'token',
        scope:         'openid profile email',
        prompt:        'select_account',
        state,
      }).toString();

    return { redirect_url: url };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body('email') email: string) {
    if (!email) return { success: false, error: 'Email is required' };
    const data = await this.authService.forgotPassword(email);
    return { success: true, data };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    const data = await this.authService.resetPassword(token, password);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('become-vendor')
  async becomeVendor(@CurrentUser() user: any, @Body() dto: BecomeVendorDto) {
    const data = await this.authService.becomeVendor(user.user_id, user.role, dto);
    return { success: true, data, message: 'Vendor application submitted' };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return { success: true, data: user };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('profile')
  async updateProfile(
    @CurrentUser() user: any,
    @Body() dto: { name?: string; phone?: string; city?: string; avatar_url?: string },
  ) {
    const data = await this.authService.updateProfile(user.user_id, dto);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: any,
    @Body('current_password') currentPassword: string,
    @Body('new_password') newPassword: string,
  ) {
    const data = await this.authService.changePassword(user.user_id, currentPassword, newPassword);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: any, @Req() req: Request) {
    const data = await this.authService.logout(user.user_id, reqCtx(req));
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('powersync-token')
  getPowerSyncToken(@CurrentUser() user: any) {
    const data = this.authService.generatePowerSyncToken(user.user_id);
    return { success: true, data };
  }

}
