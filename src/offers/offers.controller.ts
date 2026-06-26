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

@ApiTags('offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('offers')
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly offerReviewsService: OfferReviewsService,
    private readonly offerReportsService: OfferReportsService,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async detail(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.offersService.detail(id, user?.role, user?.user_id);
    return { success: true, data };
  }

  @Public()
  @Post(':id/view')
  async trackView(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const ip = (req as any).headers['x-forwarded-for']?.split(',')[0]?.trim() ?? (req as any).socket?.remoteAddress ?? 'unknown';
    await this.offersService.trackView(id, ip);
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
