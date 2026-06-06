import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VendorApplication } from '../entities/vendor-application.entity';
import { SubmitVendorApplicationDto } from './dto/vendor-apply.dto';

@ApiTags('vendor-apply')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendor-apply')
export class VendorApplyController {
  constructor(
    @InjectRepository(VendorApplication) private readonly applicationRepo: Repository<VendorApplication>,
  ) {}

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
    return {
      success: true,
      data: { id: application.id, status: 'pending', message: 'Application submitted for review' },
    };
  }
}
