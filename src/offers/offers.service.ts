import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOfferDto, UpdateOfferDto } from './dto/create-offer.dto';
import { PushService } from '../services/push.service';
import { NotificationsGateway } from '../gateway/notifications.gateway';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { OfferReviewsService } from './offer-reviews.service';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorFollower) private readonly vendorFollowerRepo: Repository<VendorFollower>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    private readonly push: PushService,
    private readonly gateway: NotificationsGateway,
    private readonly offerReviewsService: OfferReviewsService,
  ) {}

  private async getVendorId(userId: number): Promise<number> {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: userId }, select: ['id'] });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor.id;
  }

  private async assertUnderOfferLimit(vendorId: number): Promise<void> {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId }, select: ['subscription_plan'] });
    const plan = await this.planRepo.findOne({ where: { slug: vendor?.subscription_plan ?? 'free' }, select: ['max_offers', 'name'] });
    if (!plan || plan.max_offers === null) return; // no plan row or unlimited — nothing to enforce

    const activeCount = await this.offerRepo.count({ where: { vendor_id: vendorId, is_active: true } });
    if (activeCount >= plan.max_offers) {
      throw new ForbiddenException(
        `Your ${plan.name} plan allows up to ${plan.max_offers} active offer${plan.max_offers === 1 ? '' : 's'}. Upgrade your plan or deactivate an existing offer to add more.`,
      );
    }
  }

  async create(userId: number, dto: CreateOfferDto) {
    const vendorId = await this.getVendorId(userId);
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    await this.assertUnderOfferLimit(vendorId);

    const validFrom = dto.valid_from ? new Date(dto.valid_from + 'T00:00:00') : null;
    const validUntil = dto.valid_until ? new Date(dto.valid_until + 'T23:59:59') : null;

    const saved = await this.offerRepo.save({
      vendor_id: vendorId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      category: dto.category?.trim() || 'general',
      discount_percent: dto.discount_percent ?? null,
      original_price: dto.original_price ?? null,
      offer_price: dto.offer_price ?? null,
      image_url: dto.image_url?.trim() || null,
      coupon_code: dto.coupon_code?.trim() || null,
      redeem_url: dto.redeem_url?.trim() || null,
      max_redemptions: dto.max_redemptions ?? 0,
      valid_from: validFrom,
      valid_until: validUntil,
      is_active: true,
    });
    const offerId = saved.id;

    this.notifySubscribers(vendorId, offerId, dto.title.trim(), dto.discount_percent).catch(() => {});

    return { id: offerId };
  }

  private async notifySubscribers(vendorId: number, offerId: number, title: string, discountPercent?: number) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId }, select: ['business_name'] });
    if (!vendor) return;

    const followers = await this.vendorFollowerRepo.find({ where: { vendor_id: vendorId } });
    if (!followers.length) return;

    const userIds: number[] = followers.map((f: any) => f.user_id);
    const discount = discountPercent ? ` — ${discountPercent}% OFF` : '';
    const notifTitle = `New offer from ${vendor.business_name}`;
    const notifBody  = `${title}${discount}`;
    const payload = {
      type:       'new_offer',
      offer_id:   offerId,
      vendor_id:  vendorId,
      title:      notifTitle,
      body:       notifBody,
      created_at: new Date().toISOString(),
    };

    this.gateway.sendToUsers(userIds, 'notification', payload);

    await this.push.send(userIds, notifTitle, notifBody, {
      type:      'new_offer',
      offer_id:  String(offerId),
      vendor_id: String(vendorId),
    });
  }

  async update(userId: number, offerId: number, dto: UpdateOfferDto, role: string) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');

    if (role !== 'admin') {
      const vendorId = await this.getVendorId(userId);
      if (offer.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    }

    // Re-activating a previously deactivated offer must respect the plan
    // limit too, not just creating a brand new one.
    if (dto.is_active === true && !offer.is_active) {
      await this.assertUnderOfferLimit(offer.vendor_id);
    }

    const trimOrNull = (v: string | undefined) => (v?.trim() || null);
    const updateData: Partial<Offer> = {};

    if (dto.title?.trim())                           updateData.title = dto.title.trim();
    if (dto.description !== undefined)               updateData.description = trimOrNull(dto.description);
    if (dto.category?.trim())                        updateData.category = dto.category.trim();
    if (dto.image_url !== undefined)                 updateData.image_url = trimOrNull(dto.image_url);
    if (dto.coupon_code !== undefined)               updateData.coupon_code = trimOrNull(dto.coupon_code);
    if (dto.redeem_url !== undefined)                updateData.redeem_url = trimOrNull(dto.redeem_url);
    if (dto.discount_percent !== undefined)          updateData.discount_percent = dto.discount_percent;
    if (dto.original_price !== undefined)            updateData.original_price = dto.original_price;
    if (dto.offer_price !== undefined)               updateData.offer_price = dto.offer_price;
    if (dto.max_redemptions !== undefined)           updateData.max_redemptions = dto.max_redemptions;
    if (dto.is_active !== undefined)                 updateData.is_active = Boolean(dto.is_active);
    if (dto.valid_from)                              updateData.valid_from = new Date(dto.valid_from + 'T00:00:00');
    if (dto.valid_until)                             updateData.valid_until = new Date(dto.valid_until + 'T23:59:59');

    if (Object.keys(updateData).length === 0) throw new BadRequestException('No fields to update');
    await this.offerRepo.update(offerId, updateData);
    return { updated: true };
  }

  async delete(userId: number, offerId: number, role: string) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');

    if (role !== 'admin') {
      const vendorId = await this.getVendorId(userId);
      if (offer.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    }

    await this.offerRepo.update(offerId, { is_active: false });
    return { deleted: true };
  }

  async detail(offerId: number, role?: string, userId?: number) {
    const qb = this.offerRepo
      .createQueryBuilder('o')
      .innerJoin('vendors', 'v', 'v.id = o.vendor_id')
      .select([
        'o.id AS id',
        'o.vendor_id AS "vendorId"',
        'o.title AS title',
        'o.description AS description',
        'o.category AS category',
        'o.discount_percent AS "discountPercent"',
        'o.original_price AS "originalPrice"',
        'o.offer_price AS "offerPrice"',
        'o.image_url AS "imageUrl"',
        'o.coupon_code AS "couponCode"',
        'o.redeem_url AS "redeemUrl"',
        'o.max_redemptions AS "maxRedemptions"',
        'o.current_redemptions AS "currentRedemptions"',
        'o.valid_from AS "validFrom"',
        'o.valid_until AS "validUntil"',
        'o.is_active AS "isActive"',
        'o.is_featured AS "isFeatured"',
        'o.views AS views',
        'o.clicks AS clicks',
        'o.saves AS saves',
        'v.business_name AS "businessName"',
        'v.logo_url AS "vendorLogo"',
        'v.city AS "vendorCity"',
        'v.address AS "vendorAddress"',
        'v.phone AS "vendorPhone"',
        'v.website AS "vendorWebsite"',
        'v.lat AS "vendorLat"',
        'v.lng AS "vendorLng"',
        'v.category AS "vendorCategory"',
        'v.description AS "vendorDescription"',
      ])
      .where('o.id = :id', { id: offerId });

    if (role !== 'admin') {
      qb.andWhere('o.is_active = true');
    }

    const offer = await qb.getRawOne();
    if (!offer) throw new NotFoundException('Offer not found');
    const toNum = (v: any) => (v == null ? null : Number.parseFloat(v));

    const { avgRating, reviewCount } = await this.offerReviewsService.getAggregate(offerId);
    const myReview = userId ? await this.offerReviewsService.getMine(offerId, userId) : null;

    return {
      ...offer,
      discountPercent: toNum(offer.discountPercent),
      originalPrice:   toNum(offer.originalPrice),
      offerPrice:      toNum(offer.offerPrice),
      vendorLat:       toNum(offer.vendorLat),
      vendorLng:       toNum(offer.vendorLng),
      avgRating,
      reviewCount,
      myReview: myReview ? { rating: myReview.rating, comment: myReview.comment } : null,
    };
  }

  async trackView(offerId: number) {
    await this.offerRepo.increment({ id: offerId }, 'views', 1);
  }

  async myOffers(userId: number) {
    const vendorId = await this.getVendorId(userId);
    return this.offerRepo.find({
      where: { vendor_id: vendorId },
      order: { created_at: 'DESC' },
    });
  }
}
