import {
  Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe,
  UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VendorService } from './vendor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('vendor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendor')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Roles('vendor', 'admin')
  @Get('dashboard')
  async dashboard(@CurrentUser() user: any) {
    const data = await this.vendorService.dashboard(user.user_id);
    return { success: true, data };
  }

  @Public()
  @Get('profile/:id')
  async getProfile(@Param('id', ParseIntPipe) id: number) {
    const data = await this.vendorService.getProfile(id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Get('profile')
  async getMyProfile(@CurrentUser() user: any) {
    const data = await this.vendorService.getMyProfile(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Put('profile')
  async updateProfile(@CurrentUser() user: any, @Body() dto: Record<string, any>) {
    const data = await this.vendorService.updateProfile(user.user_id, dto);
    return { success: true, data };
  }

  @Get('follow-status')
  async followStatus(@CurrentUser() user: any, @Query('vendor_id', ParseIntPipe) vendorId: number) {
    const data = await this.vendorService.getFollowStatus(user.user_id, vendorId);
    return { success: true, data };
  }

  @Post('follow')
  async toggleFollow(@CurrentUser() user: any, @Body('vendor_id') vendorId: number) {
    const data = await this.vendorService.toggleFollow(user.user_id, +vendorId);
    return { success: true, data };
  }

  @Post(':id/follow')
  async follow(@CurrentUser() user: any, @Param('id', ParseIntPipe) vendorId: number) {
    const data = await this.vendorService.follow(user.user_id, vendorId);
    return { success: true, data };
  }

  @Delete(':id/follow')
  async unfollow(@CurrentUser() user: any, @Param('id', ParseIntPipe) vendorId: number) {
    const data = await this.vendorService.unfollow(user.user_id, vendorId);
    return { success: true, data };
  }

  @Get(':id/followers')
  async getFollowers(
    @Param('id', ParseIntPipe) vendorId: number,
    @Query('limit') limit?: string,
  ) {
    const data = await this.vendorService.getFollowers(vendorId, limit ? +limit : 20);
    return { success: true, data };
  }

  @Get('following')
  async getFollowing(@CurrentUser() user: any) {
    const data = await this.vendorService.getFollowing(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Get('my-plan')
  async myPlan(@CurrentUser() user: any) {
    const data = await this.vendorService.myPlan(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Get('budget-suggest')
  async budgetSuggest(@CurrentUser() user: any) {
    const data = await this.vendorService.budgetSuggest(user.user_id);
    return { success: true, data };
  }
}
