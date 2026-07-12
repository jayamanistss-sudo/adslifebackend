import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferReview } from '../entities/offer-review.entity';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';
import { PushService } from '../services/push.service';

@Injectable()
export class OfferReviewsService {
  constructor(
    @InjectRepository(OfferReview) private readonly reviewRepo: Repository<OfferReview>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    private readonly push: PushService,
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
        'r.vendor_reply AS "vendorReply"',
        'r.replied_at AS "repliedAt"',
      ])
      .where('r.offer_id = :offerId', { offerId })
      .andWhere('r.hidden_by_admin = false')
      // Only genuine written feedback in the feed — a bare star rating with
      // no comment isn't "customer feedback" to read, it's just a number,
      // which the aggregate rating below still fully accounts for.
      .andWhere("r.comment IS NOT NULL AND trim(r.comment) != ''")
      .orderBy('r.created_at', 'DESC')
      .offset((page - 1) * perPage)
      .limit(perPage)
      .getRawMany();

    const total = await this.reviewRepo
      .createQueryBuilder('r')
      .where('r.offer_id = :offerId', { offerId })
      .andWhere('r.hidden_by_admin = false')
      .andWhere("r.comment IS NOT NULL AND trim(r.comment) != ''")
      .getCount();
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

    // Previously unguarded — a vendor could rate their own offer.
    const offer = await this.offerRepo.findOne({ where: { id: offerId }, select: ['id', 'vendor_id', 'title'] });
    if (!offer) throw new NotFoundException('Offer not found');
    const vendor = await this.vendorRepo.findOne({ where: { id: offer.vendor_id }, select: ['user_id'] });
    if (vendor?.user_id === userId) {
      throw new ForbiddenException('You cannot review your own offer');
    }

    const existing = await this.reviewRepo.findOne({ where: { offer_id: offerId, user_id: userId } });
    if (existing) {
      existing.rating = rating;
      existing.comment = comment ?? null;
      return this.reviewRepo.save(existing);
    }
    const saved = await this.reviewRepo.save(
      this.reviewRepo.create({ offer_id: offerId, user_id: userId, rating, comment: comment ?? null }),
    );
    // Only on a genuinely new review, not every edit — a vendor previously
    // had no way to find out a review came in without checking the app.
    if (vendor?.user_id) {
      await this.push.send(
        vendor.user_id, '⭐ New Review', `You got a ${rating}-star review on "${offer.title}"`,
        { type: 'new_review', route: '/vendor/reviews', offer_id: String(offerId) },
      );
    }
    return saved;
  }

  async getAggregate(offerId: number): Promise<{ avgRating: number | null; reviewCount: number }> {
    const row = await this.reviewRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('r.offer_id = :offerId', { offerId })
      .andWhere('r.hidden_by_admin = false')
      .getRawOne<{ avg: string | null; count: string }>();

    return {
      avgRating: row?.avg ? Math.round(Number.parseFloat(row.avg) * 10) / 10 : null,
      reviewCount: row ? Number.parseInt(row.count, 10) : 0,
    };
  }

  async getMine(offerId: number, userId: number) {
    return this.reviewRepo.findOne({ where: { offer_id: offerId, user_id: userId } });
  }

  // Admin moderation — no such path existed at all before this.
  async adminList(page = 1, perPage = 30) {
    const [reviews, total] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('users', 'u', 'u.id = r.user_id')
      .innerJoin('offers', 'o', 'o.id = r.offer_id')
      .select([
        'r.*', 'u.name AS user_name', 'u.email AS user_email', 'o.title AS offer_title',
      ])
      .orderBy('r.created_at', 'DESC')
      .offset((page - 1) * perPage)
      .limit(perPage)
      .getRawMany()
      .then(async (rows) => [rows, await this.reviewRepo.count()] as const);
    return { reviews, total };
  }

  async setHidden(reviewId: number, hidden: boolean) {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.reviewRepo.update(reviewId, { hidden_by_admin: hidden });
    return { updated: true };
  }
}
