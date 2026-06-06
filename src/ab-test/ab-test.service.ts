import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AbTest } from '../entities/ab-test.entity';
import { UserInteraction, InteractionAction } from '../entities/user-interaction.entity';
import { Offer } from '../entities/offer.entity';

@Injectable()
export class AbTestService {
  constructor(
    @InjectRepository(AbTest) private readonly abTestRepo: Repository<AbTest>,
    @InjectRepository(UserInteraction) private readonly userInteractionRepo: Repository<UserInteraction>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
  ) {}

  async create(vendorId: number, dto: {
    name: string; offer_id_a: number; offer_id_b: number; duration_days?: number;
  }) {
    const durationDays = dto.duration_days ?? 7;
    const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const saved = await this.abTestRepo.save({
      vendor_id: vendorId,
      name: dto.name,
      offer_id_a: dto.offer_id_a,
      offer_id_b: dto.offer_id_b,
      status: 'running' as any,
      ends_at: endsAt,
    });
    return { id: saved.id };
  }

  async results(testId: number, vendorId: number, role: string) {
    const test = await this.abTestRepo.findOne({ where: { id: testId } });
    if (!test) throw new NotFoundException('A/B test not found');
    if (role !== 'admin' && test.vendor_id !== vendorId) throw new ForbiddenException('Access denied');

    const statsFor = async (offerId: number) => {
      const [views, clicks, saves] = await Promise.all([
        this.userInteractionRepo.count({
          where: { offer_id: offerId, action: InteractionAction.VIEW, created_at: MoreThanOrEqual(test.created_at) },
        }),
        this.userInteractionRepo.count({
          where: { offer_id: offerId, action: InteractionAction.CLICK, created_at: MoreThanOrEqual(test.created_at) },
        }),
        this.userInteractionRepo.count({
          where: { offer_id: offerId, action: InteractionAction.SAVE, created_at: MoreThanOrEqual(test.created_at) },
        }),
      ]);
      const v = views, c = clicks, s = saves;
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
    const test = await this.abTestRepo.findOne({ where: { id: testId } });
    if (!test) throw new NotFoundException('A/B test not found');
    if (role !== 'admin' && test.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (test.status !== 'running') throw new BadRequestException('Test is not running');

    const winnerOfferId = winnerVariant === 'A' ? test.offer_id_a : test.offer_id_b;
    const loserOfferId = winnerVariant === 'A' ? test.offer_id_b : test.offer_id_a;

    await this.abTestRepo.update(testId, {
      status: 'concluded' as any,
      winner_offer_id: winnerOfferId,
      concluded_at: new Date(),
    });
    await this.offerRepo.update(loserOfferId, { is_active: false });

    return { concluded: true, winner_offer_id: winnerOfferId };
  }
}
