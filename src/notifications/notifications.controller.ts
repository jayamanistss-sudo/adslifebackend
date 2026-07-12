import { Controller, Get, Post, Put, Delete, Body, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationTemplateService } from './notification-template.service';
import { GeminiTemplateService } from './gemini-template.service';
import { PromoScheduleConfigService } from './promo-schedule-config.service';
import { PromoNotificationService } from './promo-notification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MonitoringService } from '../monitoring/monitoring.service';
import {
  SaveTokenDto, MarkReadDto, NotificationsListQueryDto, TriggerNotificationDto,
  CreateTemplateDto, UpdateTemplateDto,
} from './dto/notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly templateService: NotificationTemplateService,
    private readonly geminiService: GeminiTemplateService,
    private readonly scheduleConfig: PromoScheduleConfigService,
    private readonly promoService: PromoNotificationService,
    private readonly monitoring: MonitoringService,
  ) {}

  @Get()
  async list(@CurrentUser() user: any, @Query() query: NotificationsListQueryDto) {
    const data = await this.notificationsService.list(user.user_id, query.limit ?? 30);
    return { success: true, data };
  }

  @Put('mark-read')
  async markRead(@CurrentUser() user: any, @Body() dto: MarkReadDto) {
    const data = await this.notificationsService.markRead(user.user_id, dto.id);
    return { success: true, data };
  }

  @Delete('clear')
  async clear(@CurrentUser() user: any) {
    const data = await this.notificationsService.clearAll(user.user_id);
    return { success: true, data };
  }

  // Called on logout so this device stops receiving pushes meant for this
  // user — without it, a shared/public device keeps getting an ex-user's
  // notifications until FCM eventually declares the token dead on its own.
  @Delete('token')
  async removeToken(@CurrentUser() user: any, @Body('token') token: string) {
    if (!token) return { success: true, data: null };
    const data = await this.notificationsService.removeToken(user.user_id, token);
    return { success: true, data };
  }

  @Delete(':id')
  async deleteOne(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.notificationsService.deleteOne(user.user_id, id);
    return { success: true, data };
  }

  @Post('save-token')
  async saveToken(@CurrentUser() user: any, @Body() dto: SaveTokenDto) {
    if (!dto.token) return { success: true, data: null };
    const data = await this.notificationsService.saveToken(
      user.user_id,
      dto.token,
      dto.platform ?? 'web',
    );
    return { success: true, data };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('trigger')
  async trigger(@Body() dto: TriggerNotificationDto) {
    const result = await this.notificationsService.trigger(
      dto.user_ids,
      dto.title,
      dto.body,
      dto.data ?? {},
    );
    return { success: true, data: result };
  }

  // ── Admin template management ──────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('templates')
  async listTemplates(@Query('type') type?: string) {
    const [data, stats] = await Promise.all([
      this.templateService.adminList(type),
      this.templateService.adminStats(),
    ]);
    return { success: true, data, stats };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    const data = await this.templateService.adminCreate(dto);
    return { success: true, data };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Put('templates/:id')
  async updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    const data = await this.templateService.adminUpdate(id, dto);
    return { success: true, data };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete('templates/:id')
  async deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    await this.templateService.adminDelete(id);
    return { success: true };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('templates/generate')
  async generateTemplates() {
    await this.geminiService.generateDailyBatch();
    return { success: true, message: 'AI generation triggered' };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('templates/seed')
  async seedTemplates() {
    const inserted = await this.templateService.seedFromDefaults();
    return { success: true, data: { inserted } };
  }

  // ── Admin campaign schedule ─────────────────────────────────────────────
  // Send times were static @Cron literals — no admin lever to retune
  // without a code deploy.

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('schedule')
  async getSchedule() {
    const data = await this.scheduleConfig.getSchedule();
    return { success: true, data };
  }

  @UseGuards(RolesGuard)
  @Roles('super')
  @Put('schedule')
  async updateSchedule(@CurrentUser() admin: any, @Body() patch: Record<string, string>) {
    const data = await this.scheduleConfig.setSchedule(patch);
    await this.promoService.reloadSchedule();
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_promo_schedule_update',
      entityType: 'site_settings', entityId: 0,
      description: `Admin updated campaign notification schedule: ${Object.keys(patch).join(', ')}`,
      metadata: patch,
    }).catch(() => {}));
    return { success: true, data, message: 'Campaign schedule updated' };
  }

  @UseGuards(RolesGuard)
  @Roles('super')
  @Put('schedule/reset')
  async resetSchedule(@CurrentUser() admin: any) {
    const data = await this.scheduleConfig.resetToDefaults();
    await this.promoService.reloadSchedule();
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_promo_schedule_reset',
      entityType: 'site_settings', entityId: 0,
      description: 'Admin reset campaign notification schedule to defaults',
    }).catch(() => {}));
    return { success: true, data, message: 'Campaign schedule reset to defaults' };
  }
}
