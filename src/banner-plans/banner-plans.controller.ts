import {
  Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsNumber, IsOptional, MaxLength, Min, IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { BannerPlan } from '../entities/banner-plan.entity';

// Top Banner is currently the only live placement on the site — position is
// fixed and not vendor/admin-selectable until more placements exist.
class CreateBannerPlanDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsNumber() @Min(1) duration_days!: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
}

class UpdateBannerPlanDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsNumber() @Min(1) duration_days?: number;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

// Default set — lets an empty banner_plans table (first setup, or after a
// data reset) be repopulated with one admin-panel click instead of a manual
// SQL insert. Matches the current live pricing.
const DEFAULT_BANNER_PLANS = [
  { name: 'Starter', duration_days: 7, price: 499, description: 'Great for short campaigns — 7 days on the home feed banner' },
  { name: 'Growth', duration_days: 30, price: 1499, description: 'Most popular choice — a full month of banner visibility' },
  { name: 'Pro', duration_days: 90, price: 3999, description: 'Maximum brand exposure — 3 months at the top of the feed' },
];

@ApiTags('banner-plans')
@Controller('banner-plans')
export class BannerPlansController {
  constructor(
    @InjectRepository(BannerPlan) private readonly repo: Repository<BannerPlan>,
  ) {}

  @Public()
  @Get()
  async list() {
    const data = await this.repo.find({
      where: { is_active: true },
      order: { duration_days: 'ASC' },
    });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Get('all')
  async listAll() {
    const data = await this.repo.find({ order: { duration_days: 'ASC' } });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post()
  async create(@Body() dto: CreateBannerPlanDto) {
    const plan = await this.repo.save({
      name: dto.name,
      duration_days: dto.duration_days,
      price: dto.price,
      description: dto.description ?? null,
      position: 'top',
      is_active: true,
    });
    return { success: true, data: plan };
  }

  // Safe to call repeatedly — no-ops if any banner plans already exist, so
  // this can't duplicate or overwrite live pricing, only repopulate an empty table.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post('seed')
  async seed() {
    const existing = await this.repo.count();
    if (existing > 0) return { success: true, data: { inserted: 0, skipped: true } };
    await this.repo.insert(DEFAULT_BANNER_PLANS.map((p) => ({ ...p, position: 'top', is_active: true })));
    return { success: true, data: { inserted: DEFAULT_BANNER_PLANS.length } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBannerPlanDto) {
    const patch: Partial<BannerPlan> = {};
    if (dto.name          !== undefined) patch.name          = dto.name;
    if (dto.duration_days !== undefined) patch.duration_days = dto.duration_days;
    if (dto.price         !== undefined) patch.price         = dto.price as any;
    if (dto.description   !== undefined) patch.description   = dto.description ?? null;
    if (dto.is_active     !== undefined) patch.is_active     = dto.is_active;
    await this.repo.update(id, patch);
    const data = await this.repo.findOne({ where: { id } });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.repo.delete(id);
    return { success: true };
  }
}
