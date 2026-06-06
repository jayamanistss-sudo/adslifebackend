import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { BannerAdRequest } from '../entities/banner-ad-request.entity';
import { Vendor } from '../entities/vendor.entity';
import { RequestBannerAdDto, ReviewBannerAdDto } from './dto/banner-ads.dto';

@ApiTags('banner-ads')
@Controller('banner-ads')
export class BannerAdsController {
  constructor(
    @InjectRepository(BannerAdRequest) private readonly bannerRepo: Repository<BannerAdRequest>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
  ) {}

  @Public()
  @Get()
  async list() {
    const data = await this.bannerRepo
      .createQueryBuilder('ba')
      .select(['ba', 'v.business_name'])
      .innerJoin(Vendor, 'v', 'ba.vendor_id = v.id')
      .where("ba.status = 'approved'")
      .andWhere('(ba.expires_at IS NULL OR ba.expires_at > NOW())')
      .orderBy('ba.created_at', 'DESC')
      .getRawMany();
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post('request')
  async request(@CurrentUser() user: any, @Body() dto: RequestBannerAdDto) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor) return { success: false, error: 'Vendor not found' };

    const banner = await this.bannerRepo.save({
      vendor_id: vendor.id,
      image_url: dto.image_url,
      target_url: dto.target_url ?? null,
      position: dto.position ?? 'top',
      duration_days: dto.duration_days ?? 7,
      status: 'pending',
    });
    return { success: true, data: { id: banner.id, status: 'pending' } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post(':id/review')
  async review(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewBannerAdDto) {
    const banner = await this.bannerRepo.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Banner ad request not found');

    const updateData: Partial<BannerAdRequest> = { status: dto.status, review_note: dto.note ?? null };
    if (dto.status === 'approved') {
      const days = banner.duration_days ?? 7;
      const expires = new Date();
      expires.setDate(expires.getDate() + days);
      updateData.expires_at = expires;
    }
    await this.bannerRepo.update(id, updateData);
    return { success: true, data: { updated: true } };
  }
}
