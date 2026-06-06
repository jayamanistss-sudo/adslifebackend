import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Category } from '../entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(@CurrentUser() user: any) {
    const isAdmin = user?.role === 'admin';
    const data = await this.categoryRepo.find({
      where: isAdmin ? {} : { is_active: true },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    const category = await this.categoryRepo.save({
      name: dto.name,
      slug: dto.slug ?? dto.name.toLowerCase().replace(/\s+/g, '-'),
      icon: dto.icon ?? null,
      sort_order: dto.sort_order ?? 0,
      is_active: true,
    });
    return { success: true, data: { id: category.id } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    const updateData: Partial<Category> = {};
    if (dto.name       !== undefined) updateData.name       = dto.name;
    if (dto.slug       !== undefined) updateData.slug       = dto.slug;
    if (dto.icon       !== undefined) updateData.icon       = dto.icon;
    if (dto.sort_order !== undefined) updateData.sort_order = dto.sort_order;
    if (dto.is_active  !== undefined) updateData.is_active  = Boolean(dto.is_active);
    if (!Object.keys(updateData).length) return { success: false, error: 'Nothing to update' };
    await this.categoryRepo.update(id, updateData);
    return { success: true, data: { updated: true } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.categoryRepo.update(id, { is_active: false });
    return { success: true, data: { deleted: true } };
  }
}
