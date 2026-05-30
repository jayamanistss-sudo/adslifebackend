import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreatePlanDto, UpdatePlanDto } from './dto/plans.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Public()
  @Get()
  async list() {
    const data = await this.db.query(
      'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price ASC',
    );
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post()
  async create(@Body() dto: CreatePlanDto) {
    const result = await this.db.query(
      `INSERT INTO subscription_plans (name, slug, price, duration_days, max_offers, features, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        dto.name,
        dto.slug,
        dto.price ?? 0,
        dto.duration_days ?? 30,
        dto.max_offers ?? 10,
        JSON.stringify(dto.features ?? []),
      ],
    );
    return { success: true, data: { id: result.insertId } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
    const fields = ['name', 'slug', 'price', 'duration_days', 'max_offers', 'is_active'] as const;
    const updates: string[] = [];
    const values: any[] = [];
    for (const f of fields) {
      if (dto[f] !== undefined) { updates.push(`${f} = ?`); values.push(dto[f]); }
    }
    if (dto.features !== undefined) {
      updates.push('features = ?');
      values.push(JSON.stringify(dto.features));
    }
    if (!updates.length) return { success: false, error: 'Nothing to update' };
    values.push(id);
    await this.db.query(`UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`, values);
    return { success: true, data: { updated: true } };
  }
}
