import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FraudDetectorService } from '../services/fraud-detector.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { Vendor } from '../entities/vendor.entity';
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
    @InjectRepository(FraudFlag) private readonly fraudFlagRepo: Repository<FraudFlag>,
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
  async review(@Param('id', ParseIntPipe) id: number, @Body() dto: FraudReviewDto) {
    await this.fraudFlagRepo.update(id, { status: dto.status as any, review_note: dto.note ?? null });
    return { success: true, data: { updated: true } };
  }
}
