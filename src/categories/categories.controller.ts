import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Category } from '../entities/category.entity';
import { Offer } from '../entities/offer.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(@CurrentUser() user: any) {
    const isAdmin = user?.role === 'admin';
    // Rank by how many live offers each category has (most first), so the
    // busiest categories surface at the top; ties fall back to sort_order.
    const rows = await this.categoryRepo
      .createQueryBuilder('c')
      .leftJoin(
        'offers',
        'o',
        `o.category = c.slug AND o.is_active = true AND (o.valid_until IS NULL OR o.valid_until >= NOW())`,
      )
      .select('c.*')
      .addSelect('COUNT(o.id)', 'offer_count')
      .where(isAdmin ? '1=1' : 'c.is_active = true')
      .groupBy('c.id')
      .orderBy('COUNT(o.id)', 'DESC')
      .addOrderBy('c.sort_order', 'ASC')
      .addOrderBy('c.name', 'ASC')
      .getRawMany();
    const data = rows.map((r) => ({ ...r, offer_count: Number(r.offer_count) }));
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

  // Offers keep a free-text category slug with no FK; this is the only way
  // an admin can currently tell how many offers a category delete/rename
  // would affect (previously: no way at all).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Get(':id/usage')
  async usage(@Param('id', ParseIntPipe) id: number) {
    const offer_count = await this.offerRepo.count({ where: { category_id: id, is_active: true } });
    return { success: true, data: { offer_count } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    const existing = await this.categoryRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    const updateData: Partial<Category> = {};
    if (dto.name       !== undefined) updateData.name       = dto.name;
    if (dto.slug       !== undefined) updateData.slug       = dto.slug;
    if (dto.icon       !== undefined) updateData.icon       = dto.icon;
    if (dto.sort_order !== undefined) updateData.sort_order = dto.sort_order;
    if (dto.is_active  !== undefined) updateData.is_active  = Boolean(dto.is_active);
    if (!Object.keys(updateData).length) return { success: false, error: 'Nothing to update' };

    await this.categoryRepo.update(id, updateData);

    // Renaming the slug previously broke every offer's category reference
    // silently — the offer kept the old slug string forever, dropping out
    // of the (slug-joined) category-filtered feed with zero admin visibility.
    if (updateData.slug && updateData.slug !== existing.slug) {
      await this.offerRepo.update({ category_id: id }, { category: updateData.slug });
    }
    return { success: true, data: { updated: true } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Body('reassign_to') reassignTo?: number) {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    const affected = await this.offerRepo.count({ where: { category_id: id, is_active: true } });
    if (affected > 0) {
      if (!reassignTo) {
        // Previously: "existing offers with this category won't be
        // affected" — false. They silently dropped out of category
        // browsing with no admin awareness at all.
        throw new BadRequestException({
          message: `${affected} active offer(s) use this category. Provide reassign_to to move them first.`,
          offer_count: affected,
        });
      }
      const target = await this.categoryRepo.findOne({ where: { id: reassignTo } });
      if (!target) throw new BadRequestException('reassign_to category not found');
      await this.offerRepo.update({ category_id: id }, { category_id: reassignTo, category: target.slug });
    }

    await this.categoryRepo.update(id, { is_active: false });
    return { success: true, data: { deleted: true, reassigned: affected } };
  }
}
