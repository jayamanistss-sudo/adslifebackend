import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubmitVendorApplicationDto } from './dto/vendor-apply.dto';

@ApiTags('vendor-apply')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendor-apply')
export class VendorApplyController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Post('submit')
  async submit(@CurrentUser() user: any, @Body() dto: SubmitVendorApplicationDto) {
    const [existing] = await this.db.query(
      'SELECT id FROM vendor_applications WHERE user_id = ? AND status = "pending"',
      [user.user_id],
    );
    if (existing) {
      return { success: false, error: 'You already have a pending application' };
    }

    const result = await this.db.query(
      `INSERT INTO vendor_applications
         (user_id, business_name, category, city, address, phone, website, gst_number, description, lat, lng, logo_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        user.user_id,
        dto.business_name,
        dto.category ?? null,
        dto.city ?? null,
        dto.address ?? null,
        dto.phone ?? null,
        dto.website ?? null,
        dto.gst_number ?? null,
        dto.description ?? null,
        dto.lat ?? null,
        dto.lng ?? null,
        dto.logo_url ?? null,
      ],
    );
    return {
      success: true,
      data: { id: result.insertId, status: 'pending', message: 'Application submitted for review' },
    };
  }
}
