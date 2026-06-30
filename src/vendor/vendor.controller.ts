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

@ApiTags('vendor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendor')
export class VendorController {
  constructor(
    private readonly vendorService: VendorService,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(OfferReview) private readonly reviewRepo: Repository<OfferReview>,
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

  @Get(':id/followers')
  async getFollowers(
    @Param('id', ParseIntPipe) vendorId: number,
    @Query('limit') limit?: string,
  ) {
    const data = await this.vendorService.getFollowers(vendorId, limit ? +limit : 20);
    return { success: true, data };
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
        'u.name AS "userName"', 'u.avatar_url AS "userAvatar"',
      ])
      .where('r.offer_id IN (:...ids)', { ids: idList })
      .orderBy('r.created_at', 'DESC')
      .offset(skip).limit(perPage)
      .getRawMany();
    const total = await this.reviewRepo
      .createQueryBuilder('r')
      .where('r.offer_id IN (:...ids)', { ids: idList })
      .getCount();
    const data = reviews.map((r) => ({ ...r, offerTitle: titleMap.get(Number(r.offerId)) ?? '' }));
    return { success: true, data, total };
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
    const data = await this.vendorService.aiGenerateOffer(user.user_id, websiteUrl, prompt);
    return { success: true, data };
  }
}
