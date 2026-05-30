import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequestSpotlightDto, ApproveSpotlightDto } from './dto/spotlight.dto';

@ApiTags('spotlight')
@Controller('spotlight')
export class SpotlightController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Public()
  @Get('active')
  async active() {
    const data = await this.db.query(
      `SELECT sr.*, v.business_name, v.logo_url, v.category
       FROM spotlight_requests sr
       JOIN vendors v ON sr.vendor_id = v.id
       WHERE sr.status = 'approved'
         AND sr.starts_at <= NOW()
         AND (sr.ends_at IS NULL OR sr.ends_at > NOW())
       ORDER BY sr.created_at DESC`,
    );
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('list')
  async list(@CurrentUser() user: any, @Query('status') status = '') {
    const isAdmin = user.role === 'admin';
    let rows: any[];
    if (isAdmin) {
      const cond = status ? 'WHERE sr.status = ?' : '';
      rows = await this.db.query(
        `SELECT sr.*, v.business_name, v.city, u.email as vendor_email, v.subscription_plan
         FROM spotlight_requests sr
         JOIN vendors v ON sr.vendor_id = v.id
         JOIN users u ON v.user_id = u.id
         ${cond} ORDER BY sr.created_at DESC`,
        status ? [status] : [],
      );
    } else {
      rows = await this.db.query(
        `SELECT sr.* FROM spotlight_requests sr
         JOIN vendors v ON sr.vendor_id = v.id
         WHERE v.user_id = ? ORDER BY sr.created_at DESC`,
        [user.user_id],
      );
    }
    return { success: true, data: { requests: rows, total: rows.length } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post('request')
  async request(@CurrentUser() user: any, @Body() dto: RequestSpotlightDto) {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [user.user_id]);
    if (!vendor) return { success: false, error: 'Vendor not found' };

    const result = await this.db.query(
      `INSERT INTO spotlight_requests (vendor_id, offer_id, message, duration_days, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [vendor.id, dto.offer_id ?? null, dto.message ?? null, dto.duration_days ?? 7],
    );
    return { success: true, data: { id: result.insertId, status: 'pending' } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveSpotlightDto) {
    if (dto.status === 'approved') {
      await this.db.query(
        `UPDATE spotlight_requests
         SET status = 'approved', starts_at = NOW(), ends_at = DATE_ADD(NOW(), INTERVAL ? DAY)
         WHERE id = ?`,
        [dto.duration_days ?? 7, id],
      );
    } else {
      await this.db.query('UPDATE spotlight_requests SET status = ? WHERE id = ?', [dto.status, id]);
    }
    return { success: true, data: { updated: true } };
  }
}
