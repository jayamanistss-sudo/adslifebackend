import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FraudDetectorService } from '../services/fraud-detector.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MonitoringService } from '../monitoring/monitoring.service';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { Vendor, VendorStatus } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { FraudReviewDto } from './dto/fraud.dto';

@ApiTags('fraud')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('fraud')
export class FraudController {
  constructor(
    private readonly fraud: FraudDetectorService,
    private readonly monitoring: MonitoringService,
    @InjectRepository(FraudFlag) private readonly fraudFlagRepo: Repository<FraudFlag>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('check-vendor/:id')
  async checkVendor(@Param('id', ParseIntPipe) id: number) {
    const data = await this.fraud.checkVendor(id);
    return { success: true, data };
  }

  @Get('check-offer/:id')
  async checkOffer(@Param('id', ParseIntPipe) id: number) {
    const data = await this.fraud.checkOffer(id);
    return { success: true, data };
  }

  @Get('flagged')
  async flagged() {
    const data = await this.fraudFlagRepo
      .createQueryBuilder('ff')
      .leftJoin(Vendor, 'v', "ff.entity_type = 'vendor' AND ff.entity_id = v.id")
      .leftJoin(Offer, 'o', "ff.entity_type = 'offer' AND ff.entity_id = o.id")
      .select([
        'ff',
        'CASE WHEN ff.entity_type=\'vendor\' THEN v.business_name WHEN ff.entity_type=\'offer\' THEN o.title END as entity_name',
      ])
      .where("ff.status = 'pending'")
      .orderBy('ff.confidence_score', 'DESC')
      .getRawMany();
    return { success: true, data };
  }

  @Post('review/:id')
  async review(@CurrentUser() admin: any, @Param('id', ParseIntPipe) id: number, @Body() dto: FraudReviewDto) {
    const flag = await this.fraudFlagRepo.findOne({ where: { id } });
    if (!flag) throw new NotFoundException('Flag not found');

    let cascadedOffers: number | undefined;
    if (dto.downstream_action === 'suspend_vendor') {
      if (flag.entity_type !== 'vendor') throw new BadRequestException('downstream_action=suspend_vendor requires a vendor flag');
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Vendor).update(flag.entity_id, {
          status: VendorStatus.SUSPENDED, review_note: dto.note || 'Suspended from a fraud review',
        });
        const result = await manager.getRepository(Offer).update(
          { vendor_id: flag.entity_id, is_active: true }, { is_active: false },
        );
        cascadedOffers = result.affected ?? 0;
      });
    } else if (dto.downstream_action === 'deactivate_offer') {
      if (flag.entity_type !== 'offer') throw new BadRequestException('downstream_action=deactivate_offer requires an offer flag');
      await this.offerRepo.update(flag.entity_id, { is_active: false });
    }

    await this.fraudFlagRepo.update(id, { status: dto.status as any, review_note: dto.note ?? null });

    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_fraud_review',
      entityType: flag.entity_type, entityId: flag.entity_id,
      description: `Fraud flag #${id} marked "${dto.status}"`
        + (dto.downstream_action ? ` with downstream action "${dto.downstream_action}"` : '')
        + (cascadedOffers ? ` — deactivated ${cascadedOffers} offer(s)` : ''),
      metadata: { flag_id: id, ...dto },
    }).catch(() => {}));

    return { success: true, data: { updated: true, cascaded_offers: cascadedOffers } };
  }
}
