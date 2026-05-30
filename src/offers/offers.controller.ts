import {
  Controller, Get, Post, Put, Delete,
  Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { CreateOfferDto, UpdateOfferDto } from './dto/create-offer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.offersService.detail(id);
    return { success: true, data };
  }

  @Public()
  @Post(':id/view')
  async trackView(@Param('id', ParseIntPipe) id: number) {
    await this.offersService.trackView(id);
    return { success: true };
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
