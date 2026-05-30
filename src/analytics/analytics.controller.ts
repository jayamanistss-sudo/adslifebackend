import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoiQueryDto, AudienceQueryDto, HeatmapQueryDto, BenchmarkQueryDto } from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('vendor', 'admin')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('roi')
  async roi(@Query() query: RoiQueryDto) {
    const data = await this.analyticsService.roi(query.offer_id, query.days ?? 30);
    return { success: true, data };
  }

  @Get('audience')
  async audience(@CurrentUser() user: any, @Query() query: AudienceQueryDto) {
    const id = query.vendor_id ?? user.user_id;
    const data = await this.analyticsService.audience(id, query.days ?? 30);
    return { success: true, data };
  }

  @Get('heatmap')
  async heatmap(@CurrentUser() user: any, @Query() query: HeatmapQueryDto) {
    const id = query.vendor_id ?? user.user_id;
    const data = await this.analyticsService.heatmap(id, query.days ?? 30);
    return { success: true, data };
  }

  @Get('benchmark')
  async benchmark(@CurrentUser() user: any, @Query() query: BenchmarkQueryDto) {
    const id = query.vendor_id ?? user.user_id;
    const data = await this.analyticsService.benchmark(id);
    return { success: true, data };
  }
}
