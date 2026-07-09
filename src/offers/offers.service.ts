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
import { MailService } from '../mail/mail.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { User } from '../entities/user.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserInteraction, InteractionAction } from '../entities/user-interaction.entity';
import { OfferReviewsService } from './offer-reviews.service';
import { FraudDetectorService } from '../services/fraud-detector.service';
import { Category } from '../entities/category.entity';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorFollower) private readonly vendorFollowerRepo: Repository<VendorFollower>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(UserInteraction) private readonly userInteractionRepo: Repository<UserInteraction>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly notificationSettings: NotificationSettingsService,
    private readonly offerReviewsService: OfferReviewsService,
    private readonly fraudDetector: FraudDetectorService,
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

  // offers.category (free-text slug) has no FK — this resolves the matching
  // categories.id alongside it so category_id stays in sync from creation.
  private async resolveCategoryId(slug: string): Promise<number | null> {
    const cat = await this.categoryRepo.findOne({ where: { slug }, select: ['id'] });
    return cat?.id ?? null;
  }

  async create(userId: number, dto: CreateOfferDto) {
    const vendorId = await this.getVendorId(userId);
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    await this.assertUnderOfferLimit(vendorId);

    const validFrom = dto.valid_from ? new Date(dto.valid_from + 'T00:00:00') : null;
    const validUntil = dto.valid_until ? new Date(dto.valid_until + 'T23:59:59') : null;
    // The date-order check existed client-side only — a direct API call
    // could create an offer that expires before it starts.
    if (validFrom && validUntil && validFrom >= validUntil) {
      throw new BadRequestException('valid_until must be after valid_from');
    }
    const category = dto.category?.trim() || 'general';

    const saved = await this.offerRepo.save({
      vendor_id: vendorId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      category,
      category_id: await this.resolveCategoryId(category),
      discount_percent: dto.discount_percent ?? null,
      original_price: dto.original_price ?? null,
      offer_price: dto.offer_price ?? null,
      image_url: dto.image_url?.trim() || null,
      images: dto.images ?? null,
      coupon_code: dto.coupon_code?.trim() || null,
      redeem_url: dto.redeem_url?.trim() || null,
      max_redemptions: dto.max_redemptions ?? 0,
      coins_required: dto.coins_required ?? 0,
      valid_from: validFrom,
      valid_until: validUntil,
      is_active: true,
    });
    const offerId = saved.id;

    // Previously the scorer only ever ran when an admin manually triggered a
    // scan on a specific offer ID — everything it could detect (suspicious
    // discount, copied description) went live unchecked. Now it runs on
    // every new offer, and a high-confidence result actually holds the offer
    // instead of just recording a flag nobody looks at.
    const fraudResult = await this.fraudDetector.checkOffer(offerId).catch(() => null);
    if (fraudResult?.action === 'auto_reject') {
      await this.offerRepo.update(offerId, { is_active: false });
      return { id: offerId, held_for_review: true };
    }

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

    // push.send() handles the in-app row, the realtime Socket.IO emit, and
    // the FCM push together — each gated by the admin's per-activity toggle.
    await this.push.send(userIds, notifTitle, notifBody, {
      type:      'new_offer',
      offer_id:  String(offerId),
      vendor_id: String(vendorId),
    });

    if (!(await this.notificationSettings.isEnabled('new_offer', 'email'))) return;

    // Email alerts: find subscribers who have email_alerts enabled
    const users = await this.userRepo.find({
      where: userIds.map(id => ({ id })),
      select: ['id', 'name', 'email', 'email_alerts'] as any,
    });
    const emailPromises = users
      .filter((u: any) => u.email_alerts !== false)
      .map((u: any) =>
        this.mail.sendNewOfferEmail(u.email, u.name, vendor.business_name, title, offerId, discountPercent),
      );
    await Promise.allSettled(emailPromises);
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
    if (dto.category?.trim()) {
      updateData.category = dto.category.trim();
      updateData.category_id = await this.resolveCategoryId(updateData.category);
    }
    if (dto.image_url !== undefined)                 updateData.image_url = trimOrNull(dto.image_url);
    if (dto.images !== undefined)                    (updateData as any).images = dto.images ?? null;
    if (dto.coupon_code !== undefined)               updateData.coupon_code = trimOrNull(dto.coupon_code);
    if (dto.redeem_url !== undefined)                updateData.redeem_url = trimOrNull(dto.redeem_url);
    if (dto.discount_percent !== undefined)          updateData.discount_percent = dto.discount_percent;
    if (dto.original_price !== undefined)            updateData.original_price = dto.original_price;
    if (dto.offer_price !== undefined)               updateData.offer_price = dto.offer_price;
    if (dto.max_redemptions !== undefined)           updateData.max_redemptions = dto.max_redemptions;
    if (dto.coins_required !== undefined)            updateData.coins_required = dto.coins_required;
    if (dto.is_active !== undefined)                 updateData.is_active = Boolean(dto.is_active);
    if (dto.valid_from)                              updateData.valid_from = new Date(dto.valid_from + 'T00:00:00');
    if (dto.valid_until)                             updateData.valid_until = new Date(dto.valid_until + 'T23:59:59');

    const effectiveFrom = updateData.valid_from ?? offer.valid_from;
    const effectiveUntil = updateData.valid_until ?? offer.valid_until;
    if (effectiveFrom && effectiveUntil && effectiveFrom >= effectiveUntil) {
      throw new BadRequestException('valid_until must be after valid_from');
    }

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
        'o.images AS images',
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
        userId
          ? `EXISTS(SELECT 1 FROM saved_offers WHERE offer_id = o.id AND user_id = :savedUserId) AS "isSaved"`
          : `FALSE AS "isSaved"`,
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

    if (userId) qb.setParameter('savedUserId', userId);
    if (role !== 'admin') {
      qb.andWhere('o.is_active = true');
    }

    const offer = await qb.getRawOne();
    if (!offer) throw new NotFoundException('Offer not found');
    const toNum = (v: any) => (v == null ? null : Number.parseFloat(v));
    const parseImages = (v: any): string[] | null => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
      return null;
    };

    const { avgRating, reviewCount } = await this.offerReviewsService.getAggregate(offerId);
    const myReview = userId ? await this.offerReviewsService.getMine(offerId, userId) : null;

    return {
      ...offer,
      discountPercent: toNum(offer.discountPercent),
      originalPrice:   toNum(offer.originalPrice),
      offerPrice:      toNum(offer.offerPrice),
      vendorLat:       toNum(offer.vendorLat),
      vendorLng:       toNum(offer.vendorLng),
      isSaved:         Boolean(offer.isSaved),
      images:          parseImages(offer.images),
      avgRating,
      reviewCount,
      myReview: myReview ? { rating: myReview.rating, comment: myReview.comment } : null,
    };
  }

  async trackView(offerId: number, ip: string, userId?: number) {
    if (userId) {
      // Signed-in users: dedupe against user_interactions (DB-backed, so it
      // survives restarts/redeploys and is correct across instances — unlike
      // the IP+in-memory fallback below, which resets on every deploy).
      const since = new Date(Date.now() - 3600000);
      const recent = await this.userInteractionRepo
        .createQueryBuilder('ui')
        .where('ui.user_id = :userId AND ui.offer_id = :offerId AND ui.action = :action AND ui.created_at >= :since',
          { userId, offerId, action: InteractionAction.VIEW, since })
        .getCount();
      if (recent > 0) return;
      await this.userInteractionRepo.insert({ user_id: userId, offer_id: offerId, action: InteractionAction.VIEW });
      await this.offerRepo.increment({ id: offerId }, 'views', 1);
      return;
    }

    // Anonymous: no stable identity beyond IP, so fall back to an in-memory
    // one-view-per-IP-per-hour cache. Opportunistically evict stale entries
    // so this map can't grow without bound over the process lifetime.
    const key = `${ip}:${offerId}`;
    const now = Date.now();
    const lastSeen = OffersService.viewCache.get(key) ?? 0;
    if (now - lastSeen < 3600000) return;
    OffersService.viewCache.set(key, now);
    if (OffersService.viewCache.size > 50000) {
      for (const [k, t] of OffersService.viewCache) {
        if (now - t >= 3600000) OffersService.viewCache.delete(k);
      }
    }
    await this.offerRepo.increment({ id: offerId }, 'views', 1);
  }

  private static readonly viewCache = new Map<string, number>();

  async myOffers(userId: number) {
    const vendorId = await this.getVendorId(userId);
    return this.offerRepo.find({
      where: { vendor_id: vendorId },
      order: { created_at: 'DESC' },
    });
  }
}
