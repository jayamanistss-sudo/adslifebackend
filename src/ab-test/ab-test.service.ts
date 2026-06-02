import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AbTestService {
  constructor(@InjectDataSource() private db: DataSource) {}

  async create(vendorId: number, dto: {
    name: string; offer_id_a: number; offer_id_b: number; duration_days?: number;
  }) {
    const durationDays = dto.duration_days ?? 7;
    const result = await this.db.query(
      `INSERT INTO ab_tests (vendor_id, name, offer_id_a, offer_id_b, status, ends_at)
       VALUES (?, ?, ?, ?, 'running', DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [vendorId, dto.name, dto.offer_id_a, dto.offer_id_b, durationDays],
    );
    return { id: result.insertId };
  }

  async results(testId: number, vendorId: number, role: string) {
    const [test] = await this.db.query('SELECT * FROM ab_tests WHERE id = ?', [testId]);
    if (!test) throw new NotFoundException('A/B test not found');
    if (role !== 'admin' && test.vendor_id !== vendorId) throw new ForbiddenException('Access denied');

    const statsFor = async (offerId: number) => {
      const [[views]] = [await this.db.query(
        'SELECT COUNT(*) as cnt FROM user_interactions WHERE offer_id = ? AND action = "view" AND created_at >= ?',
        [offerId, test.created_at],
      )];
      const [[clicks]] = [await this.db.query(
        'SELECT COUNT(*) as cnt FROM user_interactions WHERE offer_id = ? AND action = "click" AND created_at >= ?',
        [offerId, test.created_at],
      )];
      const [[saves]] = [await this.db.query(
        'SELECT COUNT(*) as cnt FROM user_interactions WHERE offer_id = ? AND action = "save" AND created_at >= ?',
        [offerId, test.created_at],
      )];
      const v = +views.cnt, c = +clicks.cnt, s = +saves.cnt;
      return { views: v, clicks: c, saves: s, ctr: v > 0 ? Math.round((c / v) * 10000) / 100 : 0 };
    };

    const [statsA, statsB] = await Promise.all([
      statsFor(test.offer_id_a),
      statsFor(test.offer_id_b),
    ]);

    const winner = statsA.ctr >= statsB.ctr ? 'A' : 'B';
    return { test, variant_a: statsA, variant_b: statsB, leading: winner };
  }

  async conclude(testId: number, winnerVariant: 'A' | 'B', vendorId: number, role: string) {
    const [test] = await this.db.query('SELECT * FROM ab_tests WHERE id = ?', [testId]);
    if (!test) throw new NotFoundException('A/B test not found');
    if (role !== 'admin' && test.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (test.status !== 'running') throw new BadRequestException('Test is not running');

    const winnerOfferId = winnerVariant === 'A' ? test.offer_id_a : test.offer_id_b;
    const loserOfferId = winnerVariant === 'A' ? test.offer_id_b : test.offer_id_a;

    await this.db.query(
      'UPDATE ab_tests SET status = "concluded", winner_offer_id = ?, concluded_at = NOW() WHERE id = ?',
      [winnerOfferId, testId],
    );
    await this.db.query('UPDATE offers SET is_active = 0 WHERE id = ?', [loserOfferId]);

    return { concluded: true, winner_offer_id: winnerOfferId };
  }
}
