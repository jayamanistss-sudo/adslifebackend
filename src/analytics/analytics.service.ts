import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Offer } from '../entities/offer.entity';
import { VendorDailyStat } from '../entities/vendor-daily-stat.entity';
import { UserInteraction } from '../entities/user-interaction.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(VendorDailyStat) private readonly dailyStatRepo: Repository<VendorDailyStat>,
    @InjectRepository(UserInteraction) private readonly interactionRepo: Repository<UserInteraction>,
  ) {}

  async roi(offerId: number, days = 30, vendorId?: number, role?: string) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (role !== 'admin' && vendorId !== undefined && offer.vendor_id !== vendorId) {
      throw new ForbiddenException('Access denied to this offer');
    }

    const since = new Date(Date.now() - days * 86400000);
    const prevSince = new Date(Date.now() - days * 2 * 86400000);

    const [current, previous] = await Promise.all([
      this.dailyStatRepo
        .createQueryBuilder('d')
        .select([
          'COALESCE(SUM(d.impressions),0) AS imp',
          'COALESCE(SUM(d.clicks),0) AS clk',
          'COALESCE(SUM(d.saves),0) AS sv',
          'COALESCE(SUM(d.redemptions),0) AS red',
        ])
        .where('d.vendor_id = :vid AND d.stat_date >= :since', { vid: offer.vendor_id, since })
        .getRawOne(),
      this.dailyStatRepo
        .createQueryBuilder('d')
        .select([
          'COALESCE(SUM(d.impressions),0) AS imp',
          'COALESCE(SUM(d.clicks),0) AS clk',
          'COALESCE(SUM(d.saves),0) AS sv',
          'COALESCE(SUM(d.redemptions),0) AS red',
        ])
        .where('d.vendor_id = :vid AND d.stat_date >= :prevSince AND d.stat_date < :since', { vid: offer.vendor_id, prevSince, since })
        .getRawOne(),
    ]);

    const imp = +current?.imp || 0, clk = +current?.clk || 0, sv = +current?.sv || 0, red = +current?.red || 0;
    const ctr = imp > 0 ? Math.round((clk / imp) * 10000) / 100 : 0;
    const conv = clk > 0 ? Math.round((red / clk) * 10000) / 100 : 0;
    const estRev = red * (Number.parseFloat(String(offer.offer_price)) || 0);
    const roiScore = Math.min(100, Math.round((ctr / 10 * 30) + (conv / 20 * 30) + (sv / Math.max(1, imp) * 100 * 20) + (red > 0 ? 20 : 0)));
    const trend = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : 0;

    return {
      impressions: imp, clicks: clk, saves: sv, redemptions: red,
      ctr, conversion_rate: conv, estimated_revenue: Math.round(estRev * 100) / 100,
      cost_per_click: 0, roi_score: roiScore,
      trends: {
        impressions: trend(imp, +previous?.imp || 0),
        clicks: trend(clk, +previous?.clk || 0),
        saves: trend(sv, +previous?.sv || 0),
        redemptions: trend(red, +previous?.red || 0),
      },
    };
  }

  async audience(vendorId: number, _days = 30) {
    const [summary, cityRows, hourRows] = await Promise.all([
      this.interactionRepo
        .createQueryBuilder('ui')
        .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
        .select([
          "COALESCE(SUM(CASE WHEN ui.action='view'  THEN 1 ELSE 0 END),0) AS total_impressions",
          "COALESCE(SUM(CASE WHEN ui.action='click' THEN 1 ELSE 0 END),0) AS total_clicks",
          "COALESCE(SUM(CASE WHEN ui.action='save'  THEN 1 ELSE 0 END),0) AS total_saves",
        ])
        .where('o.vendor_id = :vid', { vid: vendorId })
        .getRawOne(),

      this.interactionRepo
        .createQueryBuilder('ui')
        .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
        .innerJoin('users', 'u', 'u.id = ui.user_id')
        .select(['u.city AS city', 'COUNT(*) AS count'])
        .where("o.vendor_id = :vid AND u.city IS NOT NULL AND u.city != ''", { vid: vendorId })
        .groupBy('u.city')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany(),

      this.interactionRepo
        .createQueryBuilder('ui')
        .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
        .select(['EXTRACT(HOUR FROM ui.created_at) AS hr', 'COUNT(*) AS count'])
        .where('o.vendor_id = :vid', { vid: vendorId })
        .groupBy('EXTRACT(HOUR FROM ui.created_at)')
        .getRawMany(),
    ]);

    const imp = +summary?.total_impressions || 0;
    const clk = +summary?.total_clicks || 0;
    const sv  = +summary?.total_saves || 0;
    const engagementRate = imp > 0 ? Math.round(((clk + sv) / imp) * 10000) / 100 : 0;

    const peakHours: number[] = new Array<number>(24).fill(0);
    for (const r of hourRows) peakHours[+r.hr] = +r.count;

    return {
      device_breakdown: { mobile: 70, desktop: 25, tablet: 5 },
      peak_hours: peakHours,
      top_cities: cityRows,
      engagement_rate: engagementRate,
      total_impressions: imp,
      total_clicks: clk,
      total_saves: sv,
    };
  }

  async heatmap(vendorId: number, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.interactionRepo
      .createQueryBuilder('ui')
      .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
      .select([
        'EXTRACT(HOUR FROM ui.created_at) AS hour',
        'EXTRACT(DOW FROM ui.created_at) + 1 AS day_of_week',
        'COUNT(*) AS count',
      ])
      .where('o.vendor_id = :vid AND ui.created_at >= :since', { vid: vendorId, since })
      .groupBy('EXTRACT(HOUR FROM ui.created_at), EXTRACT(DOW FROM ui.created_at)')
      .getRawMany();

    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of rows) heatmap[+r.day_of_week - 1][+r.hour] = +r.count;
    return { heatmap, days };
  }

  async benchmark(vendorId: number) {
    const [myStats, industryStats] = await Promise.all([
      this.offerRepo
        .createQueryBuilder('o')
        .select([
          'COALESCE(AVG(o.views),0) AS avg_views',
          'COALESCE(AVG(o.clicks),0) AS avg_clicks',
          'COALESCE(AVG(o.saves),0) AS avg_saves',
        ])
        .where('o.vendor_id = :vid AND o.is_active = true', { vid: vendorId })
        .getRawOne(),
      this.offerRepo
        .createQueryBuilder('o')
        .select([
          'COALESCE(AVG(o.views),0) AS avg_views',
          'COALESCE(AVG(o.clicks),0) AS avg_clicks',
          'COALESCE(AVG(o.saves),0) AS avg_saves',
        ])
        .where('o.is_active = true')
        .getRawOne(),
    ]);

    return {
      your_stats: { avg_views: Math.round(+myStats.avg_views), avg_clicks: Math.round(+myStats.avg_clicks), avg_saves: Math.round(+myStats.avg_saves) },
      industry_avg: { avg_views: Math.round(+industryStats.avg_views), avg_clicks: Math.round(+industryStats.avg_clicks), avg_saves: Math.round(+industryStats.avg_saves) },
    };
  }
}
