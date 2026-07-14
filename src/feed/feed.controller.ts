import {
  Controller, Get, Post, Delete, Body, Query, UseGuards, ParseIntPipe,
  DefaultValuePipe, ParseFloatPipe, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeedService } from './feed.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { InteractionDto } from './dto/feed.dto';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Public()
  @Get('count')
  async count() {
    const total = await this.feedService.totalActiveOffers();
    return { success: true, total };
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get('personalized')
  async personalized(
    @CurrentUser() user: any,
    @Query('lat',      new DefaultValuePipe(13.0827), ParseFloatPipe) lat: number,
    @Query('lng',      new DefaultValuePipe(80.2707),  ParseFloatPipe) lng: number,
    @Query('page',     new DefaultValuePipe(1),        ParseIntPipe)   page: number,
    @Query('per_page', new DefaultValuePipe(20),       ParseIntPipe)   perPage: number,
    @Query('q') q = '',
    @Query('category') category = '',
    @Query('distance', new DefaultValuePipe(0), ParseFloatPipe) distance: number,
    @Query('filter') filter = '',
    @Query('sort') sort = '',
  ) {
    const userId = user?.user_id ?? 0;
    const { offers, total } = await this.feedService.personalized(
      userId, lat, lng, page, perPage, q, category, distance, filter, sort);
    return { success: true, data: offers, total };
  }

  @Public()
  @Get('trending')
  async trending(
    @Query('lat',      new DefaultValuePipe(13.0827), ParseFloatPipe) lat: number,
    @Query('lng',      new DefaultValuePipe(80.2707),  ParseFloatPipe) lng: number,
    @Query('page',     new DefaultValuePipe(1),        ParseIntPipe)   page: number,
    @Query('per_page', new DefaultValuePipe(20),       ParseIntPipe)   perPage: number,
    @Query('city') city: string = '',
    @Query('q') q = '',
    @Query('category') category = '',
    @Query('distance', new DefaultValuePipe(0), ParseFloatPipe) distance: number,
    @Query('filter') filter = '',
    @Query('sort') sort = '',
  ) {
    const { offers, total } = await this.feedService.trending(
      city, lat, lng, page, perPage, q, category, distance, filter, sort);
    return { success: true, data: offers, total };
  }

  @Public()
  @Get('nearby')
  async nearby(
    @Query('lat', new DefaultValuePipe(13.0827), ParseFloatPipe) lat: number,
    @Query('lng', new DefaultValuePipe(80.2707), ParseFloatPipe) lng: number,
    @Query('radius', new DefaultValuePipe(10), ParseFloatPipe) radius: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    // NearbyQueryDto declares @Min(0.1)/@Max(100) for radius, but discrete
    // @Query() params bypass class-validator — clamp here so it's actually
    // enforced instead of a caller being able to disable the radius filter
    // entirely with radius=0 or radius=999999.
    const clampedRadius = Math.min(100, Math.max(0.1, radius));
    const data = await this.feedService.nearby(lat, lng, clampedRadius, page);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('saved')
  async saved(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const data = await this.feedService.saved(user.user_id, page);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('saved-ids')
  async savedIds(@CurrentUser() user: any) {
    const data = await this.feedService.savedIds(user.user_id);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('unsave')
  async unsave(@CurrentUser() user: any, @Body('offer_id') offerId: number) {
    const data = await this.feedService.unsave(user.user_id, offerId);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('interaction')
  async interaction(@CurrentUser() user: any, @Body() dto: InteractionDto) {
    try {
      const result = await this.feedService.logInteraction(user.user_id, dto.offer_id, dto.action);
      return { success: true, data: { recorded: result.recorded } };
    } catch (e: any) {
      if (e.message === 'Offer not found') throw new NotFoundException(e.message);
      throw new BadRequestException(e.message);
    }
  }
}
