import { Controller, Post, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ShareEvent } from '../entities/share-event.entity';
import { Offer } from '../entities/offer.entity';
import { TrackShareDto } from './dto/share.dto';

@ApiTags('share')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('share')
export class ShareController {
  constructor(
    @InjectRepository(ShareEvent) private readonly shareEventRepo: Repository<ShareEvent>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
  ) {}

  @Post('track')
  async track(@CurrentUser() user: any, @Body() dto: TrackShareDto) {
    const offer = await this.offerRepo.findOne({ where: { id: dto.offer_id, is_active: true }, select: ['id'] });
    if (!offer) throw new NotFoundException('Offer not found');

    await this.shareEventRepo.save({
      user_id: user.user_id,
      offer_id: dto.offer_id,
      platform: dto.platform ?? 'general',
    });
    await this.offerRepo.increment({ id: dto.offer_id }, 'shares', 1);

    return { success: true, data: { tracked: true } };
  }
}
