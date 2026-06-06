import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MonitoringQueryDto, BlockIpDto, ExportQueryDto } from './dto/monitoring.dto';

@ApiTags('monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  // ─── Overview ─────────────────────────────────────────────────────────────

  @Get('overview')
  async overview() {
    const data = await this.monitoring.getOverview();
    return { success: true, data };
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  @Get('api-logs')
  async apiLogs(@Query() q: MonitoringQueryDto) {
    const data = await this.monitoring.getApiLogs(q);
    return { success: true, data };
  }

  @Get('auth-logs')
  async authLogs(@Query() q: MonitoringQueryDto) {
    const data = await this.monitoring.getAuthLogs(q);
    return { success: true, data };
  }

  @Get('activity-logs')
  async activityLogs(@Query() q: MonitoringQueryDto) {
    const data = await this.monitoring.getActivityLogs(q);
    return { success: true, data };
  }

  @Get('error-logs')
  async errorLogs(@Query() q: MonitoringQueryDto) {
    const data = await this.monitoring.getErrorLogs(q);
    return { success: true, data };
  }

  @Get('security-events')
  async securityEvents(@Query() q: MonitoringQueryDto) {
    const data = await this.monitoring.getSecurityEvents(q);
    return { success: true, data };
  }

  @Get('alerts')
  async alerts(@Query() q: MonitoringQueryDto) {
    const data = await this.monitoring.getAlerts(q);
    return { success: true, data };
  }

  @Put('alerts/:id/read')
  @HttpCode(HttpStatus.OK)
  async markAlertRead(@Param('id', ParseIntPipe) id: number) {
    const data = await this.monitoring.markAlertRead(id);
    return { success: true, data };
  }

  // ─── Security Event Actions ────────────────────────────────────────────────

  @Post('security-events/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveEvent(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    const resolved = await this.monitoring.resolveSecurityEvent(id, user.user_id);
    await this.monitoring.logActivity({
      userId: user.user_id, role: user.role,
      action: 'resolve_security_event', entityType: 'security_event', entityId: id,
      description: `Admin resolved security event #${id}`,
    });
    return { success: true, data: { resolved } };
  }

  // ─── IP Blocking ──────────────────────────────────────────────────────────

  @Get('blocked-ips')
  async blockedIps() {
    const data = await this.monitoring.getBlockedIps();
    return { success: true, data };
  }

  @Post('block-ip')
  @HttpCode(HttpStatus.OK)
  async blockIp(@CurrentUser() user: any, @Body() dto: BlockIpDto) {
    await this.monitoring.blockIp(
      dto.ip_address, dto.reason, user.user_id,
      dto.expires_at ? new Date(dto.expires_at) : undefined,
    );
    await this.monitoring.logActivity({
      userId: user.user_id, role: user.role,
      action: 'block_ip', entityType: 'ip',
      description: `Blocked IP ${dto.ip_address}: ${dto.reason}`,
      metadata: { ip: dto.ip_address, expires_at: dto.expires_at },
    });
    await this.monitoring.logSecurityEvent({
      eventType: 'ip_blocked', severity: 'high',
      ipAddress: dto.ip_address,
      description: `Admin blocked IP ${dto.ip_address}: ${dto.reason}`,
      metadata: { blocked_by: user.user_id },
    });
    return { success: true, data: { blocked: true } };
  }

  @Delete('block-ip/:ip')
  async unblockIp(@CurrentUser() user: any, @Param('ip') ip: string) {
    const removed = await this.monitoring.unblockIp(ip);
    await this.monitoring.logActivity({
      userId: user.user_id, role: user.role,
      action: 'unblock_ip', entityType: 'ip',
      description: `Unblocked IP ${ip}`,
    });
    return { success: true, data: { unblocked: removed } };
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────

  @Get('export')
  async export(@Query() q: ExportQueryDto, @Res() res: Response) {
    const csv = await this.monitoring.exportCsv(q.type ?? 'api_logs', q);
    const filename = `${q.type ?? 'api_logs'}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
