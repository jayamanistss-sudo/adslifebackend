import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { User } from '../entities/user.entity';
import { Offer } from '../entities/offer.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

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
    @InjectRepository(UserInteraction) private readonly interactionRepo: Repository<UserInteraction>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectDataSource() private readonly dataSource: DataSource,
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

    const [offerSummary, recentOffers, cur, prev, hourRows, dailyTrend] = await Promise.all([
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
    ]);

    const peakHours = Array(24).fill(0);
    for (const r of hourRows) peakHours[+r.hr] = parseInt(r.count);

    const curImp = +cur?.imp || 0, prevImp = +prev?.imp || 0;
    const curClk = +cur?.clk || 0, prevClk = +prev?.clk || 0;
    const curSv  = +cur?.sv  || 0, prevSv  = +prev?.sv  || 0;
    const curEng  = curImp  > 0 ? Math.round(((curClk  + curSv)  / curImp)  * 10000) / 100 : 0;
    const prevEng = prevImp > 0 ? Math.round(((prevClk + prevSv) / prevImp) * 10000) / 100 : 0;

    return {
      vendor: {
        id: vendorId,
        business_name: vendor.business_name,
        city: vendor.city,
        status: vendor.status,
        logo_url: vendor.logo_url,
        total_followers: +vendor.live_followers || 0,
        subscription_plan: vendor.subscription_plan,
        plan_name: vendor.plan_name || vendor.subscription_plan,
        plan_max_offers: +vendor.max_offers || 0,
      },
      stats: {
        impressions: curImp, clicks: curClk, saves: curSv, engagement_rate: curEng,
        impressions_trend: pctChange(curImp, prevImp),
        clicks_trend: pctChange(curClk, prevClk),
        saves_trend: pctChange(curSv, prevSv),
        engagement_trend: pctChange(Math.round(curEng), Math.round(prevEng)),
      },
      offers: {
        total: +offerSummary?.total_offers || 0, active: +offerSummary?.active_offers || 0,
        inactive: +offerSummary?.inactive_offers || 0, expired: +offerSummary?.expired_offers || 0,
        total_views: +offerSummary?.total_views || 0, total_clicks: +offerSummary?.total_clicks || 0,
        total_saves: +offerSummary?.total_saves || 0,
        total_redemptions: +offerSummary?.total_redemptions || 0,
      },
      recent_offers: recentOffers,
      peak_hours: peakHours,
      daily_trend: dailyTrend,
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
    return vendor;
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
    const v = await this.vendorRepo.findOne({ where: { id: vendorId }, select: ['id'] });
    if (!v) throw new NotFoundException('Vendor not found');

    await this.followerRepo
      .createQueryBuilder()
      .insert()
      .into(VendorFollower)
      .values({ user_id: userId, vendor_id: vendorId })
      .orIgnore()
      .execute();

    const cnt = await this.followerRepo.count({ where: { vendor_id: vendorId } });
    await this.vendorRepo.update(vendorId, { total_followers: cnt });
    return { following: true };
  }

  async unfollow(userId: number, vendorId: number) {
    await this.followerRepo.delete({ user_id: userId, vendor_id: vendorId });
    const cnt = await this.followerRepo.count({ where: { vendor_id: vendorId } });
    await this.vendorRepo.update(vendorId, { total_followers: cnt });
    return { following: false };
  }

  async getFollowers(vendorId: number, limit = 20) {
    const followers = await this.followerRepo
      .createQueryBuilder('vf')
      .innerJoin(User, 'u', 'u.id = vf.user_id')
      .select(['u.id AS id', 'u.name AS name', 'u.avatar_url AS avatar_url', 'u.city AS city', 'vf.created_at AS followed_at'])
      .where('vf.vendor_id = :vendorId', { vendorId })
      .orderBy('vf.created_at', 'DESC')
      .limit(limit)
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
    return this.followerRepo
      .createQueryBuilder('vf')
      .innerJoin(Vendor, 'v', 'v.id = vf.vendor_id')
      .select(['v.id AS id', 'v.business_name AS business_name', 'v.logo_url AS logo_url', 'v.category AS category', 'v.city AS city', 'vf.created_at AS followed_at'])
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

    // Fetch website content for context
    let siteText = '';
    try {
      const res = await fetch(websiteUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'AdsLife-Bot/1.0' },
      });
      const html = await res.text();
      // Strip tags, collapse whitespace, limit to 1500 chars
      siteText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1500);
    } catch {
      // proceed without site content if fetch fails
    }

    const systemPrompt = `You are an expert marketing copywriter for Indian local businesses.
Generate a promotional offer for a business.
Respond ONLY with a valid JSON object — no markdown, no explanation, no code fences.
The JSON must have exactly these fields:
{
  "title": "short catchy offer title (max 80 chars)",
  "description": "compelling 2-3 sentence description of the offer",
  "category": "one of: it-services, web-and-apps, software, food-and-dining, fashion, electronics, beauty, travel, entertainment, grocery, health, sports, general, networking, hardware, cybersecurity, cloud, gaming",
  "discount_percent": number between 5 and 70,
  "original_price": number in INR,
  "offer_price": number in INR,
  "coupon_code": "SHORT_CODE (max 12 chars, uppercase, no spaces)",
  "image_prompt": "a detailed prompt for generating a relevant promotional image (describe visuals, colors, style)"
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
        model: 'openai',
        jsonMode: true,
      }),
      signal: AbortSignal.timeout(30000),
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

    // Build Pollinations image URL from the generated image_prompt
    const imagePrompt = offerData.image_prompt || `${offerData.title} promotional offer advertisement`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=800&height=600&nologo=true&seed=${Date.now()}`;

    return {
      title:            offerData.title            ?? '',
      description:      offerData.description      ?? '',
      category:         offerData.category         ?? 'general',
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
