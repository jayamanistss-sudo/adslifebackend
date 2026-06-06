import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequestBannerAdDto, ReviewBannerAdDto } from './dto/banner-ads.dto';

@ApiTags('banner-ads')
@Controller('banner-ads')
export class BannerAdsController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Public()
  @Get()
  async list() {
    const data = await this.db.query(
      `SELECT ba.*, v.business_name FROM banner_ad_requests ba
       JOIN vendors v ON ba.vendor_id = v.id
       WHERE ba.status = 'approved' AND (ba.expires_at IS NULL OR ba.expires_at > NOW())
       ORDER BY ba.created_at DESC`,
    );
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post('request')
  async request(@CurrentUser() user: any, @Body() dto: RequestBannerAdDto) {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = $1', [user.user_id]);
    if (!vendor) return { success: false, error: 'Vendor not found' };

    const result = await this.db.query(
      `INSERT INTO banner_ad_requests (vendor_id, image_url, target_url, position, duration_days, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [vendor.id, dto.image_url, dto.target_url, dto.position ?? 'top', dto.duration_days ?? 7],
    );
    return { success: true, data: { id: result[0].id, status: 'pending' } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post(':id/review')
  async review(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewBannerAdDto) {
    if (dto.status === 'approved') {
      await this.db.query(
        `UPDATE banner_ad_requests
         SET status = $1, review_note = $2,
             expires_at = NOW() + (SELECT duration_days FROM banner_ad_requests WHERE id = $3) * INTERVAL '1 day'
         WHERE id = $4`,
        [dto.status, dto.note ?? null, id, id],
      );
    } else {
      await this.db.query(
        'UPDATE banner_ad_requests SET status = $1, review_note = $2 WHERE id = $3',
        [dto.status, dto.note ?? null, id],
      );
    }
    return { success: true, data: { updated: true } };
  }
}
