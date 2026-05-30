import {
  Controller, Get, Post, Body, Param, ParseIntPipe,
  Query, DefaultValuePipe, ParseFloatPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GroupDealsService } from './group-deals.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('group-deals')
@Controller('group-deals')
export class GroupDealsController {
  constructor(private readonly groupDealsService: GroupDealsService) {}

  @Public()
  @Get('active')
  async active(
    @Query('lat', new DefaultValuePipe(13.0827), ParseFloatPipe) lat: number,
    @Query('lng', new DefaultValuePipe(80.2707), ParseFloatPipe) lng: number,
  ) {
    const data = await this.groupDealsService.getActive(lat, lng);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/join')
  async join(@CurrentUser() user: any, @Param('id', ParseIntPipe) dealId: number) {
    const data = await this.groupDealsService.join(user.user_id, dealId);
    return { success: true, data };
  }

  @Public()
  @Get(':id/status')
  async status(@Param('id', ParseIntPipe) dealId: number) {
    const data = await this.groupDealsService.status(dealId);
    return { success: true, data };
  }
}
