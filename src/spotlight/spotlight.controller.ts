import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SpotlightRequest } from '../entities/spotlight-request.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { RequestSpotlightDto, ApproveSpotlightDto } from './dto/spotlight.dto';

@ApiTags('spotlight')
@Controller('spotlight')
export class SpotlightController {
  constructor(
    @InjectRepository(SpotlightRequest) private readonly spotlightRepo: Repository<SpotlightRequest>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
  ) {}

  @Public()
  @Get('active')
  async active() {
    const data = await this.spotlightRepo
      .createQueryBuilder('sr')
      .innerJoin(Vendor, 'v', 'sr.vendor_id = v.id')
      .select(['sr', 'v.business_name', 'v.logo_url', 'v.category'])
      .where("sr.status = 'approved'")
      .andWhere('sr.starts_at <= NOW()')
      .andWhere('(sr.ends_at IS NULL OR sr.ends_at > NOW())')
      .orderBy('sr.created_at', 'DESC')
      .getRawMany();
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('list')
  async list(@CurrentUser() user: any, @Query('status') status = '') {
    const isAdmin = user.role === 'admin';
    let rows: any[];

    if (isAdmin) {
      const qb = this.spotlightRepo
        .createQueryBuilder('sr')
        .innerJoin(Vendor, 'v', 'sr.vendor_id = v.id')
        .innerJoin(User, 'u', 'v.user_id = u.id')
        .select(['sr', 'v.business_name', 'v.city', 'u.email as vendor_email', 'v.subscription_plan'])
        .orderBy('sr.created_at', 'DESC');
      if (status) qb.where('sr.status = :status', { status });
      rows = await qb.getRawMany();
    } else {
      rows = await this.spotlightRepo
        .createQueryBuilder('sr')
        .innerJoin(Vendor, 'v', 'sr.vendor_id = v.id')
        .select('sr')
        .where('v.user_id = :userId', { userId: user.user_id })
        .orderBy('sr.created_at', 'DESC')
        .getRawMany();
    }

    return { success: true, data: { requests: rows, total: rows.length } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post('request')
  async request(@CurrentUser() user: any, @Body() dto: RequestSpotlightDto) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor) return { success: false, error: 'Vendor not found' };

    const spotlight = await this.spotlightRepo.save({
      vendor_id: vendor.id,
      offer_id: dto.offer_id ?? null,
      message: dto.message ?? null,
      duration_days: dto.duration_days ?? 7,
      status: 'pending',
    });
    return { success: true, data: { id: spotlight.id, status: 'pending' } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveSpotlightDto) {
    const spotlight = await this.spotlightRepo.findOne({ where: { id } });
    if (!spotlight) throw new NotFoundException('Spotlight request not found');

    const updateData: Partial<SpotlightRequest> = { status: dto.status };
    if (dto.status === 'approved') {
      const days = dto.duration_days ?? 7;
      const now = new Date();
      const ends = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      updateData.starts_at = now;
      updateData.ends_at = ends;
    }
    await this.spotlightRepo.update(id, updateData);
    return { success: true, data: { updated: true } };
  }
}
