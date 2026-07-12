import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly service: AdminAnalyticsService) {}

  @Get('logins')
  async logins(@Query('days') days?: string) {
    const data = await this.service.logins(days ? +days : 30);
    return { success: true, data };
  }

  @Get('vendor-activity')
  async vendorActivity(@Query('days') days?: string) {
    const data = await this.service.vendorActivity(days ? +days : 30);
    return { success: true, data };
  }

  @Get('geography')
  async geography(@Query('limit') limit?: string) {
    const data = await this.service.geography(limit ? +limit : 10);
    return { success: true, data };
  }

  @Get('categories')
  async categoryPerformance(@Query('limit') limit?: string) {
    const data = await this.service.categoryPerformance(limit ? +limit : 20);
    return { success: true, data };
  }

  @Get('campaigns')
  async campaignAnalytics(@Query('days') days?: string) {
    const data = await this.service.campaignAnalytics(days ? +days : 30);
    return { success: true, data };
  }
}
