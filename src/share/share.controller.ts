import { Controller, Post, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TrackShareDto } from './dto/share.dto';

@ApiTags('share')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('share')
export class ShareController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Post('track')
  async track(@CurrentUser() user: any, @Body() dto: TrackShareDto) {
    const [offer] = await this.db.query('SELECT id FROM offers WHERE id = ? AND is_active = 1', [dto.offer_id]);
    if (!offer) throw new NotFoundException('Offer not found');

    await this.db.query(
      'INSERT INTO share_events (user_id, offer_id, platform) VALUES (?, ?, ?)',
      [user.user_id, dto.offer_id, dto.platform ?? 'general'],
    );
    await this.db.query(
      'UPDATE offers SET shares = COALESCE(shares, 0) + 1 WHERE id = ?',
      [dto.offer_id],
    );

    return { success: true, data: { tracked: true } };
  }
}
