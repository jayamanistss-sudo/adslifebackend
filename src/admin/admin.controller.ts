import {
  Controller, Get, Post, Put, Body, Param, Query,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { OfferReviewsService } from '../offers/offer-reviews.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { FeedConfigService } from '../feed/feed-config.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  AdminListQueryDto, AdminVendorQueryDto, AdminOffersQueryDto,
  ReviewVendorDto, BroadcastDto, SiteSettingsDto,
  AdminVendorActionDto, AdminUserActionDto, AdminOfferActionDto,
  BulkVendorPlanDto, UpdateAdminRoleDto, AdminOfferEditDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly notificationSettings: NotificationSettingsService,
    private readonly offerReviews: OfferReviewsService,
    private readonly monitoring: MonitoringService,
    private readonly feedConfig: FeedConfigService,
  ) {}

  @Get('notification-settings')
  async getNotificationSettings() {
    const data = await this.notificationSettings.getAll();
    return { success: true, data };
  }

  @Put('notification-settings/:type')
  @ApiBody({ schema: { properties: {
    email_enabled: { type: 'boolean' }, push_enabled: { type: 'boolean' }, in_app_enabled: { type: 'boolean' },
  } } })
  async updateNotificationSetting(
    @Param('type') type: string,
    @Body() body: { email_enabled?: boolean; push_enabled?: boolean; in_app_enabled?: boolean },
  ) {
    const data = await this.notificationSettings.update(type, body);
    if (!data) return { success: false, error: 'Unknown notification type' };
    return { success: true, data };
  }

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

  @Get('vendors/:id')
  async vendorDetail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.getVendorDetail(id);
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
      query.search ?? '', query.category ?? '', query.status ?? '', limit, offset, query.vendorStatus ?? '',
    );
    return { success: true, data };
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } }) // max 3 broadcasts/min
  @Post('broadcast')
  async broadcast(@CurrentUser() user: any, @Body() dto: BroadcastDto) {
    const result = await this.adminService.broadcast(dto.title, dto.body, dto.data ?? {}, user.user_id);
    return { success: true, data: result };
  }

  @Public()
  @Get('site-settings')
  async getSiteSettings() {
    const data = await this.adminService.getSiteSettings();
    // Public route — strip anything secret-ish (payment keys etc.)
    const safe: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (/secret|api_key|password|webhook/i.test(k)) continue;
      if (k.startsWith('cashfree_') && k !== 'cashfree_env') continue;
      safe[k] = v;
    }
    return { success: true, data: safe };
  }

  // Was reachable by any plain 'admin' (class-level guard) and echoed the
  // live Cashfree secret key / webhook secret / SMTP password back in
  // plaintext — those are write-only from here on: the UI can see that a
  // secret is configured, never the value itself.
  @Roles('super')
  @Get('site-settings/all')
  async getSiteSettingsAll() {
    const data = await this.adminService.getSiteSettings();
    const masked: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      masked[k] = /secret|password|webhook/i.test(k) && v ? '••••••••' : v;
    }
    return { success: true, data: masked };
  }

  @Put('site-settings')
  async updateSiteSettings(@CurrentUser() admin: any, @Body() dto: SiteSettingsDto) {
    const data = await this.adminService.updateSiteSettings(dto, admin.user_id);
    return { success: true, data };
  }

  @Get('vendor-requests')
  async vendorRequests(
    @Query('status') status = '',
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    const offset = (Math.max(Number(page) || 1, 1) - 1) * (Number(limit) || 30);
    const data = await this.adminService.getVendorRequests(status, Number(limit) || 30, offset);
    return { success: true, data };
  }

  @Get('users/:id')
  async userDetail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.getUserDetail(id);
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

  // Elevation/demotion of the admin sub-role itself is the one action in the
  // whole panel gated tighter than the class-level @Roles('admin') — only an
  // existing super-admin can grant or revoke it.
  @Put('users/:id/admin-role')
  @Roles('super')
  @ApiBody({ type: UpdateAdminRoleDto })
  async setAdminRole(
    @CurrentUser() admin: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminRoleDto,
  ) {
    const data = await this.adminService.updateAdminRole(id, dto.admin_role, admin.user_id);
    return { success: true, data, message: 'Admin sub-role updated' };
  }

  @Put('users/:id/force-logout')
  async forceLogout(@CurrentUser() admin: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.adminService.forceLogout(id, admin.user_id);
    return { success: true, data, message: 'User signed out on all devices' };
  }

  @Put('offers/:id')
  @ApiBody({ type: AdminOfferActionDto })
  async offerAction(
    @CurrentUser() admin: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminOfferActionDto,
  ) {
    const data = await this.adminService.updateOffer(id, dto.action, dto, admin.user_id);
    return { success: true, data, message: 'Offer updated' };
  }

  // Previously admin could only toggle status — not fix a vendor's typo'd
  // title, wrong price, etc. without the vendor's own cooperation.
  @Put('offers/:id/edit')
  @ApiBody({ type: AdminOfferEditDto })
  async offerEdit(
    @CurrentUser() admin: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminOfferEditDto,
  ) {
    const data = await this.adminService.updateOfferContent(id, dto, admin.user_id);
    return { success: true, data, message: 'Offer updated' };
  }

  // is_featured was a flat boolean with no dedicated management screen at
  // all — just a star icon buried in the all-offers grid.
  @Get('offers/featured')
  async featuredOffers() {
    const data = await this.adminService.getFeaturedOffers();
    return { success: true, data };
  }

  @Put('offers/:id/featured')
  async setFeatured(
    @CurrentUser() admin: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { featured: boolean; featured_start_at?: string; featured_until?: string },
  ) {
    const data = await this.adminService.setFeatured(id, body, admin.user_id);
    return { success: true, data, message: body.featured ? 'Offer featured' : 'Offer unfeatured' };
  }

  @Put('offers/featured/reorder')
  async reorderFeatured(@Body('ordered_ids') orderedIds: number[]) {
    const data = await this.adminService.reorderFeatured(orderedIds);
    return { success: true, data };
  }

  @Put('vendors/bulk-plan')
  @ApiBody({ type: BulkVendorPlanDto })
  async bulkVendorPlan(@CurrentUser() admin: any, @Body() dto: BulkVendorPlanDto) {
    const data = await this.adminService.bulkUpdateVendorPlan(dto.vendor_ids, dto.plan, admin.user_id);
    return { success: true, data, message: `Plan updated to "${dto.plan}" for ${data.updated} vendor(s)` };
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

  // No delete/hide path existed for reviews at all before this — the only
  // mutation paths were the reviewer themselves and the vendor's own reply.
  @Get('reviews')
  async reviews(@Query('page') page = '1', @Query('limit') limit = '30') {
    const data = await this.offerReviews.adminList(Number(page) || 1, Number(limit) || 30);
    return { success: true, data };
  }

  @Put('reviews/:id/hide')
  async hideReview(@CurrentUser() admin: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.offerReviews.setHidden(id, true);
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_review_hide',
      entityType: 'review', entityId: id, description: `Admin hid review #${id}`,
    }).catch(() => {}));
    return { success: true, data, message: 'Review hidden' };
  }

  @Put('reviews/:id/unhide')
  async unhideReview(@CurrentUser() admin: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.offerReviews.setHidden(id, false);
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_review_unhide',
      entityType: 'review', entityId: id, description: `Admin restored review #${id}`,
    }).catch(() => {}));
    return { success: true, data, message: 'Review restored' };
  }

  // Every one of the ~15 feed-ranking weights was a hardcoded constant —
  // zero admin tuning surface for the single algorithm that determines what
  // every user sees first. Read is available to any admin; changing it is
  // gated to super-admins given the blast radius.
  @Get('feed-config')
  async getFeedConfig() {
    const data = await this.feedConfig.getWeights();
    return { success: true, data };
  }

  @Put('feed-config')
  @Roles('super')
  async updateFeedConfig(@CurrentUser() admin: any, @Body() patch: Record<string, number>) {
    const data = await this.feedConfig.setWeights(patch);
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_feed_config_update',
      entityType: 'site_settings', entityId: 0,
      description: `Admin updated feed ranking weights: ${Object.keys(patch).join(', ')}`,
      metadata: patch,
    }).catch(() => {}));
    return { success: true, data, message: 'Feed weights updated' };
  }

  @Put('feed-config/reset')
  @Roles('super')
  async resetFeedConfig(@CurrentUser() admin: any) {
    const data = await this.feedConfig.resetToDefaults();
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_feed_config_reset',
      entityType: 'site_settings', entityId: 0,
      description: 'Admin reset feed ranking weights to defaults',
    }).catch(() => {}));
    return { success: true, data, message: 'Feed weights reset to defaults' };
  }
}
