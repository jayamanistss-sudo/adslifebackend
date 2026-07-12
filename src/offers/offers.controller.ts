import {
  Controller, Get, Post, Put, Delete,
  Body, Param, ParseIntPipe, UseGuards,
  Query, DefaultValuePipe, Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { OfferReviewsService } from './offer-reviews.service';
import { OfferReportsService } from './offer-reports.service';
import { CreateOfferDto, UpdateOfferDto } from './dto/create-offer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedemptionCode } from '../entities/redemption-code.entity';
import { Offer } from '../entities/offer.entity';

// A redemption code previously had no expiry at all — a code generated
// today was valid forever, letting it be hoarded or shared well past its
// intended use.
const REDEMPTION_CODE_EXPIRY_HOURS = 48;

@ApiTags('offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('offers')
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly offerReviewsService: OfferReviewsService,
    private readonly offerReportsService: OfferReportsService,
    @InjectRepository(RedemptionCode) private readonly redemptionRepo: Repository<RedemptionCode>,
    @InjectRepository(Offer) private readonly offerRepoDirect: Repository<Offer>,
  ) {}

  /** In-store verification code: user shows this (or its QR) at the shop. */
  @Post(':id/redemption-code')
  async redemptionCode(@CurrentUser() user: any, @Param('id', ParseIntPipe) offerId: number) {
    const offer = await this.offerRepoDirect.findOne({
      where: { id: offerId, is_active: true }, select: ['id', 'title'],
    });
    if (!offer) return { success: false, error: 'Offer not found' };

    // Reuse an unexpired pending code so repeated opens show the same one —
    // the comment always said "unexpired" but no expiry mechanism existed
    // to actually check; a code generated once was valid forever.
    let rc = await this.redemptionRepo.findOne({
      where: { offer_id: offerId, user_id: user.user_id, status: 'pending' },
    });
    if (rc && rc.expires_at && rc.expires_at < new Date()) rc = null;
    if (!rc) {
      // 6 chars, no confusables (0/O, 1/I)
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const expiresAt = new Date(Date.now() + REDEMPTION_CODE_EXPIRY_HOURS * 3600 * 1000);
      for (let attempt = 0; attempt < 5 && !rc; attempt++) {
        const code = Array.from({ length: 6 },
          () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        try {
          rc = await this.redemptionRepo.save(
            this.redemptionRepo.create({ offer_id: offerId, user_id: user.user_id, code, expires_at: expiresAt }));
        } catch { /* code collision — retry */ }
      }
      if (!rc) return { success: false, error: 'Could not generate code, try again' };
    }
    return { success: true, data: { code: rc.code, offer_title: offer.title, expires_at: rc.expires_at } };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async detail(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.offersService.detail(id, user?.role, user?.user_id);
    return { success: true, data };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/view')
  async trackView(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const ip = (req as any).headers['x-forwarded-for']?.split(',')[0]?.trim() ?? (req as any).socket?.remoteAddress ?? 'unknown';
    await this.offersService.trackView(id, ip, user?.user_id);
    return { success: true };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/reviews')
  async listReviews(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const data = await this.offerReviewsService.list(id, page, 10, user?.user_id);
    return {
      success: true,
      data: data.reviews,
      total: data.total,
      avgRating: data.avgRating,
      reviewCount: data.reviewCount,
      myReview: data.myReview,
    };
  }

  @Post(':id/reviews')
  async submitReview(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('rating') rating: number,
    @Body('comment') comment?: string,
  ) {
    await this.offerReviewsService.upsert(id, user.user_id, rating, comment);
    const data = await this.offerReviewsService.list(id, 1, 10, user.user_id);
    return {
      success: true,
      data: data.reviews,
      total: data.total,
      avgRating: data.avgRating,
      reviewCount: data.reviewCount,
      myReview: data.myReview,
      message: 'Review submitted',
    };
  }

  @Post(':id/report')
  async reportOffer(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Body('details') details?: string,
  ) {
    const data = await this.offerReportsService.report(id, user.user_id, reason, details);
    return { success: true, data, message: 'Report submitted, our team will review it' };
  }

  @Roles('vendor', 'admin')
  @Get('my/list')
  async myOffers(@CurrentUser() user: any) {
    const data = await this.offersService.myOffers(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateOfferDto) {
    const data = await this.offersService.create(user.user_id, dto);
    return { success: true, data, message: 'Offer created' };
  }

  @Roles('vendor', 'admin')
  @Put(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOfferDto,
  ) {
    const data = await this.offersService.update(user.user_id, id, dto, user.role);
    return { success: true, data, message: 'Offer updated' };
  }

  @Roles('vendor', 'admin')
  @Delete(':id')
  async delete(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.offersService.delete(user.user_id, id, user.role);
    return { success: true, data, message: 'Offer deleted' };
  }
}
