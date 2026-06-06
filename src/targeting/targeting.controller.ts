import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserPreference } from '../entities/user-preference.entity';
import axios from 'axios';
import { ResolveAreaQueryDto, SetTargetingDto } from './dto/targeting.dto';

@ApiTags('targeting')
@Controller('targeting')
export class TargetingController {
  constructor(
    @InjectRepository(UserPreference) private readonly prefRepo: Repository<UserPreference>,
  ) {}

  @Public()
  @Get('resolve-area')
  async resolveArea(@Query() query: ResolveAreaQueryDto) {
    if (query.lat == null || query.lng == null) return { success: false, error: 'lat and lng required' };
    try {
      const { data } = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?lat=${query.lat}&lon=${query.lng}&format=json`,
        { headers: { 'User-Agent': 'AdsLife/1.0' } },
      );
      const addr = data.address || {};
      return {
        success: true,
        data: {
          city: addr.city || addr.town || addr.village || addr.county || '',
          state: addr.state || '',
          country: addr.country || '',
          postcode: addr.postcode || '',
          display_name: data.display_name || '',
        },
      };
    } catch {
      return { success: false, error: 'Geocoding failed' };
    }
  }

  @Public()
  @Get('search-area')
  async searchArea(@Query('q') q: string) {
    if (!q?.trim()) return { success: false, error: 'q is required' };
    try {
      const { data } = await axios.get(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'AdsLife/1.0' } },
      );
      if (!data?.length) return { success: false, error: 'Location not found' };
      const place = data[0];
      return {
        success: true,
        data: {
          lat: Number.parseFloat(place.lat),
          lng: Number.parseFloat(place.lon),
          display_name: place.display_name,
        },
      };
    } catch {
      return { success: false, error: 'Geocoding failed' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('set')
  async set(@CurrentUser() user: any, @Body() dto: SetTargetingDto) {
    const categories = dto.categories ?? [];
    const vendors = dto.preferred_vendors ?? [];
    const maxDistance = dto.max_distance_km ?? 15;

    const existing = await this.prefRepo.findOne({ where: { user_id: user.user_id } });
    if (existing) {
      await this.prefRepo.update(existing.id, {
        preferred_categories: categories,
        max_distance_km: maxDistance,
        preferred_vendors: vendors,
      });
    } else {
      await this.prefRepo.save({
        user_id: user.user_id,
        preferred_categories: categories,
        max_distance_km: maxDistance,
        preferred_vendors: vendors,
      });
    }
    return { success: true, data: { updated: true } };
  }
}
