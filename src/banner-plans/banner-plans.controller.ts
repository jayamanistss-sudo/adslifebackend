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
