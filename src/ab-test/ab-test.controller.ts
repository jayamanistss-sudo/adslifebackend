import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbTestService } from './ab-test.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Vendor } from '../entities/vendor.entity';
import { CreateAbTestDto, ConcludeAbTestDto } from './dto/ab-test.dto';
import { PlanFeaturesService } from '../plan-features/plan-features.service';

@ApiTags('ab-test')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('vendor', 'admin')
@Controller('ab-test')
export class AbTestController {
  constructor(
    private readonly abTestService: AbTestService,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    private readonly planFeatures: PlanFeaturesService,
  ) {}

  private async resolveVendorId(user: any): Promise<number> {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor && user.role !== 'admin') throw new ForbiddenException('Vendor profile not found');
    return vendor?.id ?? 0;
  }

  @Post('create')
  async create(@CurrentUser() user: any, @Body() dto: CreateAbTestDto) {
    const vendorId = await this.resolveVendorId(user);
    if (user.role !== 'admin' && !(await this.planFeatures.vendorHasFeature(vendorId, 'advanced_analytics'))) {
      throw new ForbiddenException("A/B testing isn't included in your current plan. Upgrade to unlock it.");
    }
    const data = await this.abTestService.create(vendorId, dto);
    return { success: true, data };
  }

  @Get(':id/results')
  async results(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const vendorId = await this.resolveVendorId(user);
    const data = await this.abTestService.results(id, vendorId, user.role);
    return { success: true, data };
  }

  @Post(':id/conclude')
  async conclude(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() dto: ConcludeAbTestDto) {
    const vendorId = await this.resolveVendorId(user);
    const data = await this.abTestService.conclude(id, dto.winner, vendorId, user.role);
    return { success: true, data };
  }
}
