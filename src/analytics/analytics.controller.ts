import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoiQueryDto, AudienceQueryDto, HeatmapQueryDto } from './dto/analytics.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('vendor', 'admin')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  private async resolveVendorId(user: any): Promise<number> {
    if (user.role === 'admin') return user.user_id;
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [user.user_id]);
    if (!vendor) throw new ForbiddenException('Vendor profile not found');
    return vendor.id;
  }

  @Get('roi')
  async roi(@CurrentUser() user: any, @Query() query: RoiQueryDto) {
    const vendorId = await this.resolveVendorId(user);
    const data = await this.analyticsService.roi(query.offer_id, query.days ?? 30, vendorId, user.role);
    return { success: true, data };
  }

  @Get('audience')
  async audience(@CurrentUser() user: any, @Query() query: AudienceQueryDto) {
    const vendorId = await this.resolveVendorId(user);
    const data = await this.analyticsService.audience(vendorId, query.days ?? 30);
    return { success: true, data };
  }

  @Get('heatmap')
  async heatmap(@CurrentUser() user: any, @Query() query: HeatmapQueryDto) {
    const vendorId = await this.resolveVendorId(user);
    const data = await this.analyticsService.heatmap(vendorId, query.days ?? 30);
    return { success: true, data };
  }

  @Get('benchmark')
  async benchmark(@CurrentUser() user: any) {
    const vendorId = await this.resolveVendorId(user);
    const data = await this.analyticsService.benchmark(vendorId);
    return { success: true, data };
  }
}
