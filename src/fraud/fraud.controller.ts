import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FraudDetectorService } from '../services/fraud-detector.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FraudReviewDto } from './dto/fraud.dto';

@ApiTags('fraud')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('fraud')
export class FraudController {
  constructor(
    private readonly fraud: FraudDetectorService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Get('check-vendor/:id')
  async checkVendor(@Param('id', ParseIntPipe) id: number) {
    const data = await this.fraud.checkVendor(id);
    return { success: true, data };
  }

  @Get('check-offer/:id')
  async checkOffer(@Param('id', ParseIntPipe) id: number) {
    const data = await this.fraud.checkOffer(id);
    return { success: true, data };
  }

  @Get('flagged')
  async flagged() {
    const data = await this.db.query(
      `SELECT ff.*, CASE WHEN ff.entity_type='vendor' THEN v.business_name WHEN ff.entity_type='offer' THEN o.title END as entity_name
       FROM fraud_flags ff
       LEFT JOIN vendors v ON ff.entity_type='vendor' AND ff.entity_id=v.id
       LEFT JOIN offers o ON ff.entity_type='offer' AND ff.entity_id=o.id
       WHERE ff.status='pending' ORDER BY ff.confidence_score DESC`,
    );
    return { success: true, data };
  }

  @Post('review/:id')
  async review(@Param('id', ParseIntPipe) id: number, @Body() dto: FraudReviewDto) {
    await this.db.query(
      'UPDATE fraud_flags SET status = ?, review_note = ? WHERE id = ?',
      [dto.status, dto.note ?? null, id],
    );
    return { success: true, data: { updated: true } };
  }
}
