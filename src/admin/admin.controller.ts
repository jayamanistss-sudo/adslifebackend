import {
  Controller, Get, Post, Put, Body, Param, Query,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  AdminListQueryDto, AdminVendorQueryDto, AdminOffersQueryDto,
  ReviewVendorDto, BroadcastDto, SiteSettingsDto,
  AdminVendorActionDto, AdminUserActionDto, AdminOfferActionDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async stats() {
    const data = await this.adminService.getStats();
    return { success: true, data };
  }

  @Get('users')
  async users(@Query() query: AdminListQueryDto) {
    const limit = query.limit ?? 30;
    const page = query.offset == null ? (query.page ?? 1) : Math.floor(query.offset / limit) + 1;
    const data = await this.adminService.getUsers(
      page, query.search ?? '', query.role ?? '', query.status ?? '', limit,
    );
    return { success: true, data };
  }

  @Get('vendors')
  async vendors(@Query() query: AdminVendorQueryDto) {
    const limit  = Number(query.limit)  || 30;
    const offset = Number(query.offset) || 0;
    const data = await this.adminService.getVendors(
      query.search ?? '', query.status ?? '', query.plan ?? '', limit, offset,
    );
    return { success: true, data };
  }

  @Put('review-vendor/:id')
  async reviewVendor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewVendorDto,
  ) {
    const data = await this.adminService.reviewVendor(id, dto.status, dto.note ?? '');
    return { success: true, data };
  }

  @Get('offers')
  async offers(@Query() query: AdminOffersQueryDto) {
    const limit  = Number(query.limit)  || 30;
    const offset = Number(query.offset) || 0;
    const data = await this.adminService.getAdminOffers(
      query.search ?? '', query.category ?? '', query.status ?? '', limit, offset,
    );
    return { success: true, data };
  }

  @Post('broadcast')
  async broadcast(@Body() dto: BroadcastDto) {
    const result = await this.adminService.broadcast(dto.title, dto.body, dto.data ?? {});
    return { success: true, data: result };
  }

  @Public()
  @Get('site-settings')
  async getSiteSettings() {
    const data = await this.adminService.getSiteSettings();
    return { success: true, data };
  }

  @Put('site-settings')
  async updateSiteSettings(@Body() dto: SiteSettingsDto) {
    const data = await this.adminService.updateSiteSettings(dto);
    return { success: true, data };
  }

  @Get('vendor-requests')
  async vendorRequests() {
    const data = await this.adminService.getVendorRequests();
    return { success: true, data };
  }

  @Put('users/:id')
  @ApiBody({ type: AdminUserActionDto })
  async userAction(
    @CurrentUser() admin: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminUserActionDto,
  ) {
    const data = await this.adminService.updateUser(id, dto.action, dto, admin.user_id);
    return { success: true, data, message: 'User updated' };
  }

  @Put('offers/:id')
  @ApiBody({ type: AdminOfferActionDto })
  async offerAction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminOfferActionDto,
  ) {
    const data = await this.adminService.updateOffer(id, dto.action, dto);
    return { success: true, data, message: 'Offer updated' };
  }

  @Put('vendors/:id')
  @ApiBody({ type: AdminVendorActionDto })
  async vendorAction(
    @CurrentUser() admin: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminVendorActionDto,
  ) {
    const data = await this.adminService.updateVendor(id, dto.action, dto, admin.user_id);
    return { success: true, data, message: 'Vendor updated' };
  }

  @Post('sync-daily-stats')
  @ApiBody({ schema: { properties: { date: { type: 'string', example: '2026-06-05', description: 'YYYY-MM-DD — defaults to yesterday' } } } })
  async syncDailyStats(@Body('date') date?: string) {
    const data = await this.adminService.syncDailyStats(date);
    return { success: true, data };
  }
}
