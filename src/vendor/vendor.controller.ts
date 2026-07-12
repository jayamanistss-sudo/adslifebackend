import {
  Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe,
  UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorService } from './vendor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UpdateVendorProfileDto } from './dto/vendor.dto';
import { Offer } from '../entities/offer.entity';
import { OfferReview } from '../entities/offer-review.entity';
import { RedemptionCode } from '../entities/redemption-code.entity';
import { PlanFeaturesService } from '../plan-features/plan-features.service';
import { PushService } from '../services/push.service';

@ApiTags('vendor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendor')
export class VendorController {
  constructor(
    private readonly vendorService: VendorService,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(OfferReview) private readonly reviewRepo: Repository<OfferReview>,
    @InjectRepository(RedemptionCode) private readonly redemptionRepo: Repository<RedemptionCode>,
    private readonly planFeatures: PlanFeaturesService,
    private readonly push: PushService,
  ) {}

  @Roles('vendor', 'admin')
  @Get('dashboard')
  async dashboard(@CurrentUser() user: any) {
    const data = await this.vendorService.dashboard(user.user_id);
    return { success: true, data };
  }

  @Public()
  @Get('profile/:id')
  async getProfile(@Param('id', ParseIntPipe) id: number) {
    const data = await this.vendorService.getProfile(id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Get('profile')
  async getMyProfile(@CurrentUser() user: any) {
    const data = await this.vendorService.getMyProfile(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Put('profile')
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateVendorProfileDto) {
    const data = await this.vendorService.updateProfile(user.user_id, dto);
    return { success: true, data };
  }

  @Get('follow-status')
  async followStatus(@CurrentUser() user: any, @Query('vendor_id', ParseIntPipe) vendorId: number) {
    const data = await this.vendorService.getFollowStatus(user.user_id, vendorId);
    return { success: true, data };
  }

  @Post('follow')
  @ApiBody({ schema: { required: ['vendor_id'], properties: { vendor_id: { type: 'number', example: 1 } } } })
  async toggleFollow(@CurrentUser() user: any, @Body('vendor_id') vendorId: number) {
    const data = await this.vendorService.toggleFollow(user.user_id, +vendorId);
    return { success: true, data };
  }

  @Post(':id/follow')
  async follow(@CurrentUser() user: any, @Param('id', ParseIntPipe) vendorId: number) {
    const data = await this.vendorService.follow(user.user_id, vendorId);
    return { success: true, data };
  }

  @Delete(':id/follow')
  async unfollow(@CurrentUser() user: any, @Param('id', ParseIntPipe) vendorId: number) {
    const data = await this.vendorService.unfollow(user.user_id, vendorId);
    return { success: true, data };
  }

  // Previously reachable by ANY authenticated user for ANY vendor id — no
  // @Roles, no ownership check. Restricted to the vendor themselves (or
  // admin) since gating this by the CALLING vendor's plan requires knowing
  // whose plan to check in the first place.
  @Roles('vendor', 'admin')
  @Get(':id/followers')
  async getFollowers(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) vendorId: number,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    if (user.role !== 'admin') {
      const myVendorId = await this.vendorService.getMyVendorId(user.user_id);
      if (myVendorId !== vendorId) return { success: false, error: 'Not your vendor profile' };
    }
    const take = limit ? +limit : 20;
    const offset = page ? Math.max(+page - 1, 0) * take : 0;
    const [subscriberCount, subscriberDetails] = await Promise.all([
      this.planFeatures.vendorHasFeature(vendorId, 'subscriber_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'subscriber_details'),
    ]);
    const data = await this.vendorService.getFollowers(vendorId, take, offset);
    return {
      success: true,
      data: {
        ...data,
        // The list itself is real PII (name/city/date) — hard-gated, not
        // just blurred, unlike the count fields alongside it.
        followers: subscriberDetails ? data.followers : [],
        locked: { subscriber_count: !subscriberCount, subscriber_details: !subscriberDetails },
      },
    };
  }

  @Get('following')
  async getFollowing(@CurrentUser() user: any) {
    const data = await this.vendorService.getFollowing(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Get('my-plan')
  async myPlan(@CurrentUser() user: any) {
    const data = await this.vendorService.myPlan(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Get('budget-suggest')
  async budgetSuggest(@CurrentUser() user: any) {
    const data = await this.vendorService.budgetSuggest(user.user_id);
    return { success: true, data };
  }

  @Roles('vendor', 'admin')
  @Get('reviews')
  async myReviews(@CurrentUser() user: any, @Query('page') page = '1') {
    const vendor = await this.vendorService.getMyVendorId(user.user_id);
    if (!vendor) return { success: true, data: [] };
    if (user.role !== 'admin' && !(await this.planFeatures.vendorHasFeature(vendor, 'review_access'))) {
      return { success: false, error: "Reviews aren't included in your current plan. Upgrade to unlock it.", code: 'PLAN_FEATURE_LOCKED' };
    }
    const offerIds = await this.offerRepo
      .find({ where: { vendor_id: vendor }, select: ['id', 'title'] });
    if (!offerIds.length) return { success: true, data: [] };
    const idList = offerIds.map((o) => o.id);
    const titleMap = new Map(offerIds.map((o) => [o.id, o.title]));
    const perPage = 20;
    const skip = (Number(page) - 1) * perPage;
    const reviews = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('users', 'u', 'u.id = r.user_id')
      .select([
        'r.id AS id', 'r.offer_id AS "offerId"', 'r.rating AS rating',
        'r.comment AS comment', 'r.created_at AS "createdAt"',
        'r.vendor_reply AS "vendorReply"', 'r.replied_at AS "repliedAt"',
        'u.name AS "userName"', 'u.avatar_url AS "userAvatar"',
      ])
      .where('r.offer_id IN (:...ids)', { ids: idList })
      .andWhere('r.hidden_by_admin = false')
      // Only genuine written feedback — a bare star rating with no comment
      // isn't feedback to read/reply to.
      .andWhere("r.comment IS NOT NULL AND trim(r.comment) != ''")
      .orderBy('r.created_at', 'DESC')
      .offset(skip).limit(perPage)
      .getRawMany();
    const total = await this.reviewRepo
      .createQueryBuilder('r')
      .where('r.offer_id IN (:...ids)', { ids: idList })
      .andWhere('r.hidden_by_admin = false')
      .andWhere("r.comment IS NOT NULL AND trim(r.comment) != ''")
      .getCount();
    const data = reviews.map((r) => ({ ...r, offerTitle: titleMap.get(Number(r.offerId)) ?? '' }));
    return { success: true, data, total };
  }

  @Roles('vendor', 'admin')
  @Put('reviews/:id/reply')
  @ApiBody({ schema: { required: ['reply'], properties: { reply: { type: 'string', example: 'Thank you for the feedback!' } } } })
  async replyToReview(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) reviewId: number,
    @Body('reply') reply: string,
  ) {
    const vendorId = await this.vendorService.getMyVendorId(user.user_id);
    if (!vendorId) return { success: false, error: 'Vendor not found' };
    if (user.role !== 'admin' && !(await this.planFeatures.vendorHasFeature(vendorId, 'review_access'))) {
      return { success: false, error: "Reviews aren't included in your current plan. Upgrade to unlock it.", code: 'PLAN_FEATURE_LOCKED' };
    }
    const review = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('offers', 'o', 'o.id = r.offer_id')
      .select(['r.id AS id', 'r.user_id AS "userId"', 'r.offer_id AS "offerId"', 'o.title AS "offerTitle"'])
      .where('r.id = :reviewId AND o.vendor_id = :vendorId', { reviewId, vendorId })
      .getRawOne();
    if (!review) return { success: false, error: 'Review not found' };
    const text = (reply ?? '').trim();
    await this.reviewRepo.update(reviewId, {
      vendor_reply: text.length ? text.slice(0, 1000) : null,
      replied_at: text.length ? new Date() : null,
    });
    // The reviewer previously never found out their review got a reply
    // unless they happened to revisit the offer page.
    if (text.length) {
      await this.push.send(
        review.userId, 'You got a reply!', `The vendor replied to your review on "${review.offerTitle}".`,
        { type: 'review_reply', route: `/offer/${review.offerId}`, offer_id: String(review.offerId) },
      );
    }
    return { success: true, data: { replied: true } };
  }

  @Roles('vendor', 'admin')
  @Post('redemptions/verify')
  @ApiBody({ schema: { required: ['code'], properties: { code: { type: 'string', example: 'AB12CD' } } } })
  async verifyRedemption(@CurrentUser() user: any, @Body('code') code: string) {
    const vendorId = await this.vendorService.getMyVendorId(user.user_id);
    if (!vendorId) return { success: false, error: 'Vendor not found' };
    const clean = (code ?? '').trim().toUpperCase();
    if (!clean) return { success: false, error: 'Enter a code' };

    const row = await this.redemptionRepo
      .createQueryBuilder('rc')
      .innerJoin('offers', 'o', 'o.id = rc.offer_id')
      .innerJoin('users', 'u', 'u.id = rc.user_id')
      .select(['rc.id AS id', 'rc.status AS status', 'rc.user_id AS user_id',
               'rc.offer_id AS offer_id', 'rc.expires_at AS expires_at', 'o.vendor_id AS owner_vendor_id',
               'o.title AS offer_title', 'u.name AS user_name'])
      .where('rc.code = :clean', { clean })
      .getRawOne();
    if (!row) return { success: false, error: 'Invalid code — no such code exists' };
    if (Number(row.owner_vendor_id) !== Number(vendorId)) {
      return { success: false, error: "This code belongs to another shop's offer — it can only be verified by that shop" };
    }
    if (row.status === 'verified') {
      return { success: false, error: 'Code already used' };
    }
    // Previously no expiry existed at all — a code generated once was valid
    // forever.
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { success: false, error: 'This code has expired — ask the customer to generate a new one' };
    }

    await this.redemptionRepo.update(row.id, {
      status: 'verified', verified_at: new Date(), verified_by: user.user_id,
    });
    // Count as a verified redemption for analytics (unique per user handled
    // by the interaction pipeline semantics; verified codes are one-shot).
    await this.redemptionRepo.manager.query(
      `INSERT INTO user_interactions (user_id, offer_id, action, category)
       SELECT $1, $2, 'redeem', o.category FROM offers o WHERE o.id = $2`,
      [row.user_id, row.offer_id],
    );
    await this.offerRepo.increment({ id: row.offer_id }, 'current_redemptions', 1);
    return {
      success: true,
      data: { offer_title: row.offer_title, customer: row.user_name, verified: true },
    };
  }

  @Roles('vendor', 'admin')
  @Post('ai-generate-offer')
  @ApiBody({ schema: { required: ['website_url', 'prompt'], properties: {
    website_url: { type: 'string', example: 'https://stss.in' },
    prompt: { type: 'string', example: 'Create a web development offer with 30% discount' },
  }}})
  async aiGenerateOffer(
    @CurrentUser() user: any,
    @Body('website_url') websiteUrl: string,
    @Body('prompt') prompt: string,
  ) {
    if (!websiteUrl || !prompt) {
      return { success: false, error: 'website_url and prompt are required' };
    }
    const vendorId = await this.vendorService.getMyVendorId(user.user_id);
    if (user.role !== 'admin' && (!vendorId || !(await this.planFeatures.vendorHasFeature(vendorId, 'ai_generation')))) {
      return { success: false, error: 'AI offer generation isn\'t included in your current plan. Upgrade to Pro to unlock it.', code: 'PLAN_FEATURE_LOCKED' };
    }
    const data = await this.vendorService.aiGenerateOffer(user.user_id, websiteUrl, prompt);
    return { success: true, data };
  }
}
