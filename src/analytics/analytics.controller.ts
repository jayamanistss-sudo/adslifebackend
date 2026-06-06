import {
  Controller, Get, Query, UseGuards,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Vendor } from '../entities/vendor.entity';
import { RoiQueryDto, AudienceQueryDto, HeatmapQueryDto, BenchmarkQueryDto } from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('vendor', 'admin')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
  ) {}

  private async resolveVendorId(user: any, queryVendorId?: number): Promise<number> {
    if (user.role === 'admin') {
      if (!queryVendorId) throw new BadRequestException('Admin must provide vendor_id query param');
      return queryVendorId;
    }
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor) throw new ForbiddenException('Vendor profile not found');
    return vendor.id;
  }

  @Get('roi')
  async roi(@CurrentUser() user: any, @Query() query: RoiQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    const data = await this.analyticsService.roi(query.offer_id, query.days ?? 30, vendorId, user.role);
    return { success: true, data };
  }

  @Get('audience')
  async audience(@CurrentUser() user: any, @Query() query: AudienceQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    const data = await this.analyticsService.audience(vendorId, query.days ?? 30);
    return { success: true, data };
  }

  @Get('heatmap')
  async heatmap(@CurrentUser() user: any, @Query() query: HeatmapQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    const data = await this.analyticsService.heatmap(vendorId, query.days ?? 30);
    return { success: true, data };
  }

  @Get('benchmark')
  async benchmark(@CurrentUser() user: any, @Query() query: BenchmarkQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    const data = await this.analyticsService.benchmark(vendorId);
    return { success: true, data };
  }
}
