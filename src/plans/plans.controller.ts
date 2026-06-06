import {
  Controller, Get, Post, Put, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { CreatePlanDto, UpdatePlanDto } from './dto/plans.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(@CurrentUser() user: any) {
    const isAdmin = user?.role === 'admin';
    const data = await this.planRepo.find({
      where: isAdmin ? {} : { is_active: true },
      order: { price: 'ASC' },
    });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post()
  async create(@Body() dto: CreatePlanDto) {
    const plan = await this.planRepo.save({
      name: dto.name,
      slug: dto.slug,
      price: dto.price ?? 0,
      duration_days: dto.duration_days ?? 30,
      max_offers: dto.max_offers ?? null,
      features: dto.features ?? [],
      is_active: true,
    });
    return { success: true, data: { id: plan.id } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
    const updateData: Partial<SubscriptionPlan> = {};
    if (dto.name       !== undefined) updateData.name          = dto.name;
    if (dto.slug       !== undefined) updateData.slug          = dto.slug;
    if (dto.price      !== undefined) updateData.price         = dto.price as any;
    if (dto.duration_days !== undefined) updateData.duration_days = dto.duration_days;
    if (dto.max_offers !== undefined) updateData.max_offers    = dto.max_offers;
    if (dto.features   !== undefined) updateData.features      = dto.features;
    if (dto.is_active  !== undefined) updateData.is_active     = dto.is_active === 1;

    if (!Object.keys(updateData).length) return { success: false, error: 'Nothing to update' };
    await this.planRepo.update(id, updateData);
    return { success: true, data: { updated: true } };
  }
}
