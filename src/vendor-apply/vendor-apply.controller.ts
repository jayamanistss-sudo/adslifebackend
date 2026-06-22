import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VendorApplication } from '../entities/vendor-application.entity';
import { User, UserRole } from '../entities/user.entity';
import { PushService } from '../services/push.service';
import { SubmitVendorApplicationDto } from './dto/vendor-apply.dto';

@ApiTags('vendor-apply')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendor-apply')
export class VendorApplyController {
  constructor(
    @InjectRepository(VendorApplication) private readonly applicationRepo: Repository<VendorApplication>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly push: PushService,
  ) {}

  @Get('status')
  async status(@CurrentUser() user: any) {
    const latest = await this.applicationRepo.findOne({
      where: { user_id: user.user_id },
      order: { created_at: 'DESC' },
    });
    if (!latest) return { success: true, data: null };
    return {
      success: true,
      data: {
        id: latest.id,
        status: latest.status,
        business_name: latest.business_name,
        created_at: latest.created_at,
      },
    };
  }

  @Post('submit')
  async submit(@CurrentUser() user: any, @Body() dto: SubmitVendorApplicationDto) {
    const existing = await this.applicationRepo.findOne({
      where: { user_id: user.user_id, status: 'pending' },
      select: ['id'],
    });
    if (existing) {
      return { success: false, error: 'You already have a pending application' };
    }

    const application = await this.applicationRepo.save({
      user_id: user.user_id,
      business_name: dto.business_name,
      category: dto.category ?? null,
      city: dto.city ?? null,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      website: dto.website ?? null,
      gst_number: dto.gst_number ?? null,
      description: dto.description ?? null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      logo_url: dto.logo_url ?? null,
      status: 'pending',
    });

    const admins = await this.userRepo.find({ where: { role: UserRole.ADMIN }, select: ['id'] });
    if (admins.length) {
      await this.push.send(
        admins.map((a) => a.id),
        'New Vendor Application',
        `${dto.business_name} applied to become a vendor — review it now.`,
        { type: 'vendor_application_new', application_id: String(application.id) },
      );
    }

    return {
      success: true,
      data: { id: application.id, status: 'pending', message: 'Application submitted for review' },
    };
  }
}
