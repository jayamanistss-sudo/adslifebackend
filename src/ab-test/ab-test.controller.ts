import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AbTestService } from './ab-test.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateAbTestDto, ConcludeAbTestDto } from './dto/ab-test.dto';

@ApiTags('ab-test')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('vendor', 'admin')
@Controller('ab-test')
export class AbTestController {
  constructor(
    private readonly abTestService: AbTestService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Post('create')
  async create(@CurrentUser() user: any, @Body() dto: CreateAbTestDto) {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [user.user_id]);
    const data = await this.abTestService.create(vendor?.id ?? 0, dto);
    return { success: true, data };
  }

  @Get(':id/results')
  async results(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [user.user_id]);
    const data = await this.abTestService.results(id, vendor?.id ?? 0, user.role);
    return { success: true, data };
  }

  @Post(':id/conclude')
  async conclude(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() dto: ConcludeAbTestDto) {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [user.user_id]);
    const data = await this.abTestService.conclude(id, dto.winner, vendor?.id ?? 0, user.role);
    return { success: true, data };
  }
}
