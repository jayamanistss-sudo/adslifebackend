import { Controller, Get, Post, Put, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SaveTokenDto, MarkReadDto, NotificationsListQueryDto, TriggerNotificationDto,
} from './dto/notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
}
