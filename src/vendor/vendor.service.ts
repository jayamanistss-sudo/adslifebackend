import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { User } from '../entities/user.entity';
import { Offer } from '../entities/offer.entity';
import { OfferReview } from '../entities/offer-review.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { PlanFeaturesService } from '../plan-features/plan-features.service';
import { PushService } from '../services/push.service';

function pctChange(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '+100%' : '0%';
  const change = Math.round(((cur - prev) / prev) * 1000) / 10;
  return (change >= 0 ? '+' : '') + change + '%';
}

@Injectable()
export class VendorService {
  constructor(
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorFollower) private readonly followerRepo: Repository<VendorFollower>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(OfferReview) private readonly reviewRepo: Repository<OfferReview>,
    @InjectRepository(UserInteraction) private readonly interactionRepo: Repository<UserInteraction>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly planFeatures: PlanFeaturesService,
    private readonly push: PushService,
  ) {}

  async dashboard(userId: number) {
    const vendor = await this.vendorRepo
      .createQueryBuilder('v')
      .leftJoin(SubscriptionPlan, 'sp', 'sp.slug = v.subscription_plan')
      .select([
        'v.*',
        'sp.name AS plan_name', 'sp.slug AS plan_slug',
        'sp.max_offers AS max_offers', 'sp.duration_days AS duration_days',
        'sp.price AS plan_price', 'sp.features AS plan_features',
        '(SELECT COUNT(*) FROM vendor_followers WHERE vendor_id = v.id) AS live_followers',
      ])
      .where('v.user_id = :userId', { userId })
      .getRawOne();
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    const vendorId = +vendor.id;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [offerSummary, recentOffers, cur, prev, hourRows, dailyTrend, reviewSummary] = await Promise.all([
      this.offerRepo.createQueryBuilder('o')
        .select([
          'COUNT(*) AS total_offers',
          'SUM(CASE WHEN o.is_active=true THEN 1 ELSE 0 END) AS active_offers',
          'SUM(CASE WHEN o.is_active=false THEN 1 ELSE 0 END) AS inactive_offers',
          'SUM(CASE WHEN o.valid_until IS NOT NULL AND o.valid_until < NOW() AND o.is_active=true THEN 1 ELSE 0 END) AS expired_offers',
          'COALESCE(SUM(o.views),0) AS total_views',
          'COALESCE(SUM(o.clicks),0) AS total_clicks',
          'COALESCE(SUM(o.saves),0) AS total_saves',
          'COALESCE(SUM(o.current_redemptions),0) AS total_redemptions',
        ])
        .where('o.vendor_id = :vendorId', { vendorId })
        .getRawOne(),

      this.offerRepo.find({
        where: { vendor_id: vendorId },
        select: ['id', 'title', 'category', 'discount_percent', 'views', 'clicks', 'saves', 'is_active', 'valid_until', 'current_redemptions', 'max_redemptions'],
        order: { created_at: 'DESC' },
        take: 5,
      }),

      this.interactionRepo.createQueryBuilder('ui')
        .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
        .select([
          "COALESCE(SUM(CASE WHEN ui.action='view' THEN 1 ELSE 0 END),0) AS imp",
          "COALESCE(SUM(CASE WHEN ui.action='click' THEN 1 ELSE 0 END),0) AS clk",
          "COALESCE(SUM(CASE WHEN ui.action='save' THEN 1 ELSE 0 END),0) AS sv",
        ])
        .where('o.vendor_id = :vendorId AND ui.created_at >= :since', { vendorId, since: thirtyDaysAgo })
        .getRawOne(),

      this.interactionRepo.createQueryBuilder('ui')
        .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
        .select([
          "COALESCE(SUM(CASE WHEN ui.action='view' THEN 1 ELSE 0 END),0) AS imp",
          "COALESCE(SUM(CASE WHEN ui.action='click' THEN 1 ELSE 0 END),0) AS clk",
          "COALESCE(SUM(CASE WHEN ui.action='save' THEN 1 ELSE 0 END),0) AS sv",
        ])
        .where('o.vendor_id = :vendorId AND ui.created_at >= :from AND ui.created_at < :to', {
          vendorId, from: sixtyDaysAgo, to: thirtyDaysAgo,
        })
        .getRawOne(),

      this.dataSource.createQueryBuilder()
        .select(['EXTRACT(HOUR FROM oi.created_at) AS hr', 'COUNT(*) AS count'])
        .from('offer_impressions', 'oi')
        .innerJoin('offers', 'o', 'o.id = oi.offer_id')
        .where('o.vendor_id = :vendorId AND oi.created_at >= :since', { vendorId, since: thirtyDaysAgo })
        .groupBy('EXTRACT(HOUR FROM oi.created_at)')
        .getRawMany(),

      this.interactionRepo.createQueryBuilder('ui')
        .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
        .select([
          'ui.created_at::date AS stat_date',
          "SUM(CASE WHEN ui.action='view' THEN 1 ELSE 0 END) AS impressions",
          "SUM(CASE WHEN ui.action='click' THEN 1 ELSE 0 END) AS clicks",
          "SUM(CASE WHEN ui.action='save' THEN 1 ELSE 0 END) AS saves",
        ])
        .where('o.vendor_id = :vendorId AND ui.created_at >= :since', { vendorId, since: fourteenDaysAgo })
        .groupBy('ui.created_at::date')
        .orderBy('stat_date', 'ASC')
        .getRawMany(),

      this.reviewRepo.createQueryBuilder('r')
        .innerJoin(Offer, 'o', 'o.id = r.offer_id')
        .select(['COUNT(*) AS total_reviews', 'COALESCE(AVG(r.rating),0) AS avg_rating'])
        .where('o.vendor_id = :vendorId', { vendorId })
        .getRawOne(),
    ]);

    const peakHours = Array(24).fill(0);
    for (const r of hourRows) peakHours[+r.hr] = parseInt(r.count);

    const curImp = +cur?.imp || 0, prevImp = +prev?.imp || 0;
    const curClk = +cur?.clk || 0, prevClk = +prev?.clk || 0;
    const curSv  = +cur?.sv  || 0, prevSv  = +prev?.sv  || 0;
    const curEng  = curImp  > 0 ? Math.round(((curClk  + curSv)  / curImp)  * 10000) / 100 : 0;
    const prevEng = prevImp > 0 ? Math.round(((prevClk + prevSv) / prevImp) * 10000) / 100 : 0;

    // Granular per-metric gating — the response always carries the real
    // numbers (never stripped/undefined, so the UI never crashes reaching
    // for a missing key); `locked` tells the frontend which cards to render
    // blurred with an upgrade CTA instead of hiding them outright. Actual
    // PII (who/when — the audience "details" drill-down, followers list)
    // stays hard-gated elsewhere; this is just the soft aggregate-count tease.
    const [viewCount, clickCount, saveCount, redeemedCount, subscriberCount, viewsGraph, hasFullAnalytics, reviewAccess, aiGeneration] = await Promise.all([
      this.planFeatures.vendorHasFeature(vendorId, 'view_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'click_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'save_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'redeemed_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'subscriber_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'analytics_views_graph'),
      this.planFeatures.vendorHasFeature(vendorId, 'analytics_full'),
      this.planFeatures.vendorHasFeature(vendorId, 'review_access'),
      this.planFeatures.vendorHasFeature(vendorId, 'ai_generation'),
    ]);

    return {
      vendor: {
        id: vendorId,
        business_name: vendor.business_name,
        city: vendor.city,
        status: vendor.status,
        logo_url: vendor.logo_url,
        total_followers: +vendor.live_followers || 0,
        total_reviews: +reviewSummary?.total_reviews || 0,
        avg_rating: Math.round((+reviewSummary?.avg_rating || 0) * 10) / 10,
        subscription_plan: vendor.subscription_plan,
        plan_name: vendor.plan_name || vendor.subscription_plan,
        plan_max_offers: +vendor.max_offers || 0,
      },
      stats: {
        impressions: curImp,
        impressions_trend: pctChange(curImp, prevImp),
        clicks: curClk, saves: curSv,
        clicks_trend: pctChange(curClk, prevClk),
        saves_trend: pctChange(curSv, prevSv),
        ...(hasFullAnalytics ? {
          engagement_rate: curEng,
          engagement_trend: pctChange(Math.round(curEng), Math.round(prevEng)),
        } : {}),
      },
      offers: {
        total: +offerSummary?.total_offers || 0, active: +offerSummary?.active_offers || 0,
        inactive: +offerSummary?.inactive_offers || 0, expired: +offerSummary?.expired_offers || 0,
        total_views: +offerSummary?.total_views || 0,
        total_clicks: +offerSummary?.total_clicks || 0,
        total_saves: +offerSummary?.total_saves || 0,
        total_redemptions: +offerSummary?.total_redemptions || 0,
      },
      recent_offers: recentOffers,
      peak_hours: peakHours,
      daily_trend: viewsGraph ? dailyTrend : [],
      locked: {
        view_count: !viewCount,
        click_count: !clickCount,
        save_count: !saveCount,
        redeemed_count: !redeemedCount,
        subscriber_count: !subscriberCount,
        analytics_views_graph: !viewsGraph,
        engagement: !hasFullAnalytics,
        review_access: !reviewAccess,
        ai_generation: !aiGeneration,
      },
    };
  }

  async getMyVendorId(userId: number): Promise<number | null> {
    const v = await this.vendorRepo.findOne({ where: { user_id: userId }, select: ['id'] });
    return v?.id ?? null;
  }

  async getMyProfile(userId: number) {
    const vendor = await this.vendorRepo
      .createQueryBuilder('v')
      .innerJoin(User, 'u', 'u.id = v.user_id')
      .select(['v.*', 'u.name AS name', 'u.email AS email', 'u.avatar_url AS user_avatar'])
      .where('v.user_id = :userId', { userId })
      .getRawOne();
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async getProfile(vendorId: number) {
    const vendor = await this.vendorRepo
      .createQueryBuilder('v')
      .innerJoin(User, 'u', 'u.id = v.user_id')
      .select(['v.*', 'u.name AS name', 'u.avatar_url AS user_avatar'])
      .where('v.id = :vendorId', { vendorId })
      .getRawOne();
    if (!vendor) throw new NotFoundException('Vendor not found');

    // Public vendor page needs the full picture in one call
    const [followersCount, offers, badgeTier, ratingRow] = await Promise.all([
      this.followerRepo.count({ where: { vendor_id: vendorId } }),
      this.offerRepo.find({
        where: { vendor_id: vendorId, is_active: true },
        order: { created_at: 'DESC' },
      }),
      this.planFeatures.badgeTierForPlan(vendor.subscription_plan ?? 'starter'),
      // Aggregating directly over individual reviews (rather than averaging
      // each offer's own avgRating) naturally weights offers with more
      // reviews more heavily in the vendor-level rating.
      this.reviewRepo.createQueryBuilder('r')
        .innerJoin(Offer, 'o', 'o.id = r.offer_id')
        .select(['COALESCE(AVG(r.rating),0) AS avg_rating', 'COUNT(*) AS review_count'])
        .where('o.vendor_id = :vendorId', { vendorId })
        .getRawOne(),
    ]);
    return {
      ...vendor, followers_count: followersCount, offers, verified_badge_tier: badgeTier,
      rating: Math.round((+ratingRow?.avg_rating || 0) * 10) / 10,
      review_count: +ratingRow?.review_count || 0,
    };
  }

  async updateProfile(userId: number, dto: Record<string, any>) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: userId }, select: ['id'] });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const allowed = ['business_name', 'category', 'city', 'address', 'phone', 'website', 'description', 'logo_url', 'lat', 'lng', 'gst_number'];
    const updateData: Partial<Vendor> = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) (updateData as any)[key] = dto[key];
    }
    if (Object.keys(updateData).length === 0) return { updated: false };
    await this.vendorRepo.update(vendor.id, updateData);
    return { updated: true };
  }

  async getFollowStatus(userId: number, vendorId: number) {
    const [row, cnt] = await Promise.all([
      this.followerRepo.findOne({ where: { user_id: userId, vendor_id: vendorId }, select: ['id'] }),
      this.followerRepo.count({ where: { vendor_id: vendorId } }),
    ]);
    return { following: !!row, followers_count: cnt };
  }

  async toggleFollow(userId: number, vendorId: number) {
    const existing = await this.followerRepo.findOne({ where: { user_id: userId, vendor_id: vendorId }, select: ['id'] });
    let following: boolean;
    if (existing) {
      await this.followerRepo.delete({ user_id: userId, vendor_id: vendorId });
      following = false;
    } else {
      await this.followerRepo
        .createQueryBuilder()
        .insert()
        .into(VendorFollower)
        .values({ user_id: userId, vendor_id: vendorId })
        .orIgnore()
        .execute();
      following = true;
    }
    const cnt = await this.followerRepo.count({ where: { vendor_id: vendorId } });
    return { following, followers_count: cnt };
  }

  async follow(userId: number, vendorId: number) {
    const v = await this.vendorRepo.findOne({ where: { id: vendorId }, select: ['id', 'user_id', 'business_name'] });
    if (!v) throw new NotFoundException('Vendor not found');

    // Checked before the insert (which uses orIgnore) so a repeat follow —
    // e.g. a UI retry — doesn't fire a duplicate notification for a no-op.
    const alreadyFollowing = await this.followerRepo.findOne({
      where: { user_id: userId, vendor_id: vendorId }, select: ['id'],
    });

    await this.followerRepo
      .createQueryBuilder()
      .insert()
      .into(VendorFollower)
      .values({ user_id: userId, vendor_id: vendorId })
      .orIgnore()
      .execute();

    const cnt = await this.followerRepo.count({ where: { vendor_id: vendorId } });
    await this.vendorRepo.update(vendorId, { total_followers: cnt });

    // Every other engagement event (review, review reply, offer approval...)
    // notifies the vendor — new followers were the one silent gap.
    if (!alreadyFollowing && v.user_id && v.user_id !== userId) {
      const follower = await this.userRepo.findOne({ where: { id: userId }, select: ['name'] });
      await this.push.send(
        v.user_id, 'New follower!', `${follower?.name ?? 'Someone'} started following ${v.business_name}.`,
        { type: 'new_follower', route: '/vendor/dashboard' },
      );
    }

    return { following: true };
  }

  async unfollow(userId: number, vendorId: number) {
    await this.followerRepo.delete({ user_id: userId, vendor_id: vendorId });
    const cnt = await this.followerRepo.count({ where: { vendor_id: vendorId } });
    await this.vendorRepo.update(vendorId, { total_followers: cnt });
    return { following: false };
  }

  async getFollowers(vendorId: number, limit = 20, offset = 0) {
    const followers = await this.followerRepo
      .createQueryBuilder('vf')
      .innerJoin(User, 'u', 'u.id = vf.user_id')
      .select(['u.id AS id', 'u.name AS name', 'u.avatar_url AS avatar_url', 'u.city AS city', 'vf.created_at AS followed_at'])
      .where('vf.vendor_id = :vendorId', { vendorId })
      .orderBy('vf.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [total, thisMonth, lastMonth] = await Promise.all([
      this.followerRepo.count({ where: { vendor_id: vendorId } }),
      this.followerRepo.createQueryBuilder('vf').where('vf.vendor_id = :id AND vf.created_at >= :start', { id: vendorId, start: thisMonthStart }).getCount(),
      this.followerRepo.createQueryBuilder('vf').where('vf.vendor_id = :id AND vf.created_at >= :start AND vf.created_at < :end', { id: vendorId, start: lastMonthStart, end: thisMonthStart }).getCount(),
    ]);

    const tm = thisMonth, lm = lastMonth;
    const growth_pct = lm > 0 ? Math.round(((tm - lm) / lm) * 1000) / 10 : tm > 0 ? 100 : 0;

    return { total, this_month: tm, last_month: lm, growth_pct, followers };
  }

  async getFollowing(userId: number) {
    // active_offers/total_followers were never selected here — both web and
    // mobile's "Subscribed shops" card read these fields and, finding them
    // always undefined, fell back to their own `?? 0`, showing "0 offers ·
    // 0 followers" for every shop regardless of the real numbers.
    return this.followerRepo
      .createQueryBuilder('vf')
      .innerJoin(Vendor, 'v', 'v.id = vf.vendor_id')
      .select([
        'v.id AS id', 'v.business_name AS business_name', 'v.logo_url AS logo_url',
        'v.category AS category', 'v.city AS city', 'vf.created_at AS followed_at',
        // Cast to int: a bare COUNT(*) is bigint, which node-pg returns as a
        // JS string — the mobile client casts this field `as num`, which
        // would throw on a JSON string instead of a JSON number.
        '(SELECT COUNT(*) FROM offers o WHERE o.vendor_id = v.id AND o.is_active = true)::int AS active_offers',
        '(SELECT COUNT(*) FROM vendor_followers WHERE vendor_id = v.id)::int AS total_followers',
      ])
      .where('vf.user_id = :userId', { userId })
      .orderBy('vf.created_at', 'DESC')
      .getRawMany();
  }

  async myPlan(userId: number) {
    const vendor = await this.vendorRepo
      .createQueryBuilder('v')
      .leftJoin(SubscriptionPlan, 'sp', 'sp.slug = v.subscription_plan')
      .select(['v.subscription_plan AS subscription_plan', 'v.plan_expires_at AS plan_expires_at', 'sp.*'])
      .where('v.user_id = :userId', { userId })
      .getRawOne();
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async aiGenerateOffer(userId: number, websiteUrl: string, prompt: string) {
    const vendor = await this.vendorRepo.findOne({
      where: { user_id: userId },
      select: ['id', 'business_name', 'city', 'category'],
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    // Fetch website content for context — pull the title, meta description and
    // visible body text so the model actually understands the business.
    let siteText = '';
    try {
      const res = await fetch(websiteUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdsLife-Bot/1.0)' },
      });
      const html = await res.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';
      const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? '';
      const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? '';
      const body = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3500);
      siteText = [
        title && `Page title: ${title}`,
        (metaDesc || ogDesc) && `Description: ${metaDesc || ogDesc}`,
        body && `Content: ${body}`,
      ].filter(Boolean).join('\n');
    } catch {
      // proceed without site content if fetch fails
    }

    const systemPrompt = `You are a senior marketing strategist and copywriter for Indian local businesses.
First ANALYSE the business from its website content and the vendor's request, then craft ONE compelling, realistic promotional offer.

Rules:
- Prices must be realistic for the specific business and the Indian market (₹). Ensure offer_price = original_price minus discount_percent, rounded to a clean number.
- The title must be punchy and specific to THIS business (mention the actual product/service), not generic.
- The description must sell the concrete value and include a light call-to-action.
- Pick the single best-fitting category from the allowed list.
- image_prompt: write a rich, photographic prompt for a professional promotional banner — describe the subject, setting, lighting, colours, composition and mood. Aim for an ad-agency-quality visual. Do NOT include any text, letters, or logos in the image description.

Respond ONLY with a valid JSON object — no markdown, no explanation, no code fences — with exactly these fields:
{
  "title": "short catchy offer title (max 80 chars)",
  "description": "compelling 2-3 sentence description of the offer",
  "category": "one of: it-services, web-and-apps, software, food-and-dining, fashion, electronics, beauty, travel, entertainment, grocery, health, sports, general, networking, hardware, cybersecurity, cloud, gaming",
  "discount_percent": number between 5 and 70,
  "original_price": number in INR,
  "offer_price": number in INR,
  "coupon_code": "SHORT_CODE (max 12 chars, uppercase, no spaces)",
  "image_prompt": "detailed photographic prompt, no text in image"
}`;

    const userMessage = `Business: ${vendor.business_name || 'Local Business'}
City: ${vendor.city || 'India'}
Website content: ${siteText || 'Not available'}
Vendor request: ${prompt}

Generate a compelling offer JSON.`;

    // Call Pollinations.ai text API (free, no key required)
    const pollinationsRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        // 'openai-large' (GPT-4o class) reasons far better about the business
        // and produces realistic pricing vs the small default model.
        // 'openai-fast' (GPT-OSS 20B reasoning) is the current free anonymous
        // model; the previous 'openai-large' was removed from the legacy API
        // and started returning 404 (which surfaced as a 400 to the vendor).
        model: 'openai-fast',
        temperature: 0.7,
        jsonMode: true,
      }),
      // reasoning model can take ~20s; allow generous headroom
      signal: AbortSignal.timeout(45000),
    });

    if (!pollinationsRes.ok) {
      throw new BadRequestException('AI service unavailable, please try again');
    }

    const rawText = await pollinationsRes.text();
    let offerData: any;
    try {
      // Strip markdown fences if present
      const clean = rawText.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
      offerData = JSON.parse(clean);
    } catch {
      throw new BadRequestException('AI returned invalid response, please try again');
    }

    // The model doesn't always return a clean category slug — normalise it
    // against the allowed list (fall back to the vendor's own category, then
    // 'general') so the offer form receives a value it can actually select.
    const allowedCategories = [
      'it-services', 'web-and-apps', 'software', 'food-and-dining', 'fashion',
      'electronics', 'beauty', 'travel', 'entertainment', 'grocery', 'health',
      'sports', 'general', 'networking', 'hardware', 'cybersecurity', 'cloud', 'gaming',
    ];
    const rawCategory = String(offerData.category ?? '').toLowerCase().trim();
    const normalizedCategory = allowedCategories.includes(rawCategory)
      ? rawCategory
      : allowedCategories.find((c) => rawCategory.includes(c) || c.includes(rawCategory))
        ?? (vendor.category && allowedCategories.includes(vendor.category) ? vendor.category : 'general');

    // Build a high-quality image URL from the generated image_prompt.
    // 'flux' is Pollinations' best photoreal model; enhance=true lets it
    // expand the prompt; 1024x768 (4:3) matches the offer-card crop.
    const basePrompt = offerData.image_prompt || `${offerData.title} promotional offer advertisement`;
    const styledPrompt = `${basePrompt}, professional advertising photography, high detail, studio lighting, vibrant, 4k, no text`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(styledPrompt)}?width=1024&height=768&model=flux&enhance=true&nologo=true&seed=${Date.now() % 100000}`;

    return {
      title:            offerData.title            ?? '',
      description:      offerData.description      ?? '',
      category:         normalizedCategory,
      discount_percent: offerData.discount_percent ?? 20,
      original_price:   offerData.original_price   ?? '',
      offer_price:      offerData.offer_price       ?? '',
      coupon_code:      offerData.coupon_code       ?? '',
      image_url:        imageUrl,
    };
  }

  async budgetSuggest(userId: number) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: userId }, select: ['id'] });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const stats = await this.interactionRepo
      .createQueryBuilder('ui')
      .innerJoin(Offer, 'o', 'o.id = ui.offer_id')
      .select([
        "COALESCE(SUM(CASE WHEN ui.action='view' THEN 1 ELSE 0 END),0) AS views",
        "COALESCE(SUM(CASE WHEN ui.action='click' THEN 1 ELSE 0 END),0) AS clicks",
      ])
      .where('o.vendor_id = :id AND ui.created_at >= :since', { id: vendor.id, since: thirtyDaysAgo })
      .getRawOne();

    const ctr = stats?.views > 0 ? (stats.clicks / stats.views) * 100 : 0;
    const suggestedBudget = ctr > 5 ? 2000 : ctr > 2 ? 1000 : 500;

    return {
      current_ctr: Math.round(ctr * 100) / 100,
      suggested_budget_inr: suggestedBudget,
      recommendation: ctr > 5
        ? 'Your CTR is excellent. Consider upgrading to a premium plan for more reach.'
        : ctr > 2
        ? 'Good engagement. A mid-tier plan would help grow your audience.'
        : 'Focus on improving offer quality to boost CTR before scaling budget.',
    };
  }
}
