import { Controller, Post, Body, Get, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthDto, BecomeVendorDto } from './dto/google-auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto);
    return { success: true, data, message: 'Login successful' };
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const data = await this.authService.register(dto);
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
        client_id:     process.env.GOOGLE_CLIENT_ID     || '',
        redirect_uri:  process.env.GOOGLE_CALLBACK_URI  || '',
        response_type: 'token',
        scope:         'openid profile email',
        prompt:        'select_account',
        state,
      }).toString();

    return { redirect_url: url };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('become-vendor')
  async becomeVendor(@CurrentUser() user: any, @Body() dto: BecomeVendorDto) {
    const data = await this.authService.becomeVendor(user.user_id, dto);
    return { success: true, data, message: 'Vendor application submitted' };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return { success: true, data: user };
  }
}
