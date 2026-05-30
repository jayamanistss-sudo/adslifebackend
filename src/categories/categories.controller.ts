import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Public()
  @Get()
  async list() {
    const data = await this.db.query(
      'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC',
    );
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    const result = await this.db.query(
      'INSERT INTO categories (name, slug, icon, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
      [
        dto.name,
        dto.slug ?? dto.name.toLowerCase().replace(/\s+/g, '-'),
        dto.icon ?? null,
        dto.sort_order ?? 0,
      ],
    );
    return { success: true, data: { id: result.insertId } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    const fields = ['name', 'slug', 'icon', 'sort_order', 'is_active'] as const;
    const updates: string[] = [];
    const values: any[] = [];
    for (const f of fields) {
      if (dto[f] !== undefined) { updates.push(`${f} = ?`); values.push(dto[f]); }
    }
    if (!updates.length) return { success: false, error: 'Nothing to update' };
    values.push(id);
    await this.db.query(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, values);
    return { success: true, data: { updated: true } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.db.query('UPDATE categories SET is_active = 0 WHERE id = ?', [id]);
    return { success: true, data: { deleted: true } };
  }
}
