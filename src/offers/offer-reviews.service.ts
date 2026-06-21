import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferReview } from '../entities/offer-review.entity';

@Injectable()
export class OfferReviewsService {
  constructor(
    @InjectRepository(OfferReview) private readonly reviewRepo: Repository<OfferReview>,
  ) {}

  async list(offerId: number, page = 1, perPage = 10, userId?: number) {
    const reviews = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('users', 'u', 'u.id = r.user_id')
      .select([
        'r.id AS id',
        'r.rating AS rating',
        'r.comment AS comment',
        'r.created_at AS "createdAt"',
        'u.name AS "userName"',
        'u.avatar_url AS "userAvatar"',
      ])
      .where('r.offer_id = :offerId', { offerId })
      .orderBy('r.created_at', 'DESC')
      .offset((page - 1) * perPage)
      .limit(perPage)
      .getRawMany();

    const total = await this.reviewRepo.count({ where: { offer_id: offerId } });
    const { avgRating, reviewCount } = await this.getAggregate(offerId);
    const myReview = userId ? await this.getMine(offerId, userId) : null;

    return {
      reviews,
      total,
      avgRating,
      reviewCount,
      myReview: myReview ? { rating: myReview.rating, comment: myReview.comment } : null,
    };
  }

  async upsert(offerId: number, userId: number, rating: number, comment?: string) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('rating must be an integer between 1 and 5');
    }

    const existing = await this.reviewRepo.findOne({ where: { offer_id: offerId, user_id: userId } });
    if (existing) {
      existing.rating = rating;
      existing.comment = comment ?? null;
      return this.reviewRepo.save(existing);
    }
    return this.reviewRepo.save(
      this.reviewRepo.create({ offer_id: offerId, user_id: userId, rating, comment: comment ?? null }),
    );
  }

  async getAggregate(offerId: number): Promise<{ avgRating: number | null; reviewCount: number }> {
    const row = await this.reviewRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('r.offer_id = :offerId', { offerId })
      .getRawOne<{ avg: string | null; count: string }>();

    return {
      avgRating: row?.avg ? Math.round(Number.parseFloat(row.avg) * 10) / 10 : null,
      reviewCount: row ? Number.parseInt(row.count, 10) : 0,
    };
  }

  async getMine(offerId: number, userId: number) {
    return this.reviewRepo.findOne({ where: { offer_id: offerId, user_id: userId } });
  }
}
