import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTicketDto, ReplyTicketDto } from './dto/support.dto';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateTicketDto) {
    const data = await this.supportService.create(
      user.user_id,
      dto.subject,
      dto.message,
      dto.category ?? 'general',
      dto.priority,
    );
    return { success: true, data, message: 'Ticket created' };
  }

  @Get()
  async list(@CurrentUser() user: any, @Query('status') status = '') {
    const data = await this.supportService.list(user.user_id, user.role, status);
    return { success: true, data };
  }

  @Post(':id/reply')
  async reply(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplyTicketDto,
  ) {
    const data = await this.supportService.reply(id, user.user_id, dto.message, user.role, dto.status, dto.priority);
    return { success: true, data };
  }
}
