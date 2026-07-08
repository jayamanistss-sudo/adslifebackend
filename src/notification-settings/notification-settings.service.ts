import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationSetting } from '../entities/notification-setting.entity';

export type NotificationChannel = 'email' | 'push' | 'in_app';

interface SeedRow {
  activity_type: string;
  category: string;
  label: string;
  email_enabled: boolean;
}

// Every activity type the system currently sends, grouped for the admin UI.
// email_enabled defaults to what already happens today (only these three
// flows send an email alongside the notification); push/in_app default true
// for all — flipping any of these off is the admin opting OUT of current
// behavior, not a silent behavior change on first deploy.
const SEED: SeedRow[] = [
  { activity_type: 'morning',              category: 'Scheduled / Marketing', label: 'Good morning offers',        email_enabled: false },
  { activity_type: 'lunch',                category: 'Scheduled / Marketing', label: 'Lunch time offers',          email_enabled: false },
  { activity_type: 'evening',               category: 'Scheduled / Marketing', label: 'Evening offers',             email_enabled: false },
  { activity_type: 'dinner',                category: 'Scheduled / Marketing', label: 'Dinner time offers',         email_enabled: false },
  { activity_type: 'goodnight',             category: 'Scheduled / Marketing', label: 'Goodnight offers',            email_enabled: false },
  { activity_type: 'weekend',               category: 'Scheduled / Marketing', label: 'Weekend special offers',     email_enabled: false },
  { activity_type: 'reengage',              category: 'Scheduled / Marketing', label: 'Re-engagement (inactive users)', email_enabled: false },
  { activity_type: 'personalized_search',   category: 'Scheduled / Marketing', label: 'Abandoned search follow-up', email_enabled: false },
  { activity_type: 'interest_alert',        category: 'Scheduled / Marketing', label: 'Category interest alert',    email_enabled: false },
  { activity_type: 'expiry_reminder',       category: 'Scheduled / Marketing', label: 'Saved offer expiring soon',  email_enabled: false },
  { activity_type: 'vendor_application_new', category: 'Vendor lifecycle',    label: 'New vendor application (to admins)', email_enabled: false },
  { activity_type: 'vendor_approved',       category: 'Vendor lifecycle',      label: 'Vendor application approved', email_enabled: true },
  { activity_type: 'vendor_rejected',       category: 'Vendor lifecycle',      label: 'Vendor application rejected', email_enabled: true },
  { activity_type: 'plan_activated',        category: 'Vendor lifecycle',      label: 'Subscription plan activated', email_enabled: false },
  { activity_type: 'plan_expired',          category: 'Vendor lifecycle',      label: 'Subscription plan expired',   email_enabled: false },
  { activity_type: 'vendor_digest',         category: 'Vendor lifecycle',      label: 'Weekly vendor performance digest', email_enabled: false },
  { activity_type: 'new_offer',             category: 'Social',                 label: 'New offer from followed vendor', email_enabled: true },
  { activity_type: 'banner_approved',       category: 'Banner ads',            label: 'Banner ad approved',          email_enabled: true },
  { activity_type: 'banner_rejected',       category: 'Banner ads',            label: 'Banner ad rejected',          email_enabled: true },
  { activity_type: 'banner_live',           category: 'Banner ads',            label: 'Banner ad is live',           email_enabled: true },
  { activity_type: 'spotlight_approved',    category: 'Spotlight',             label: 'Spotlight request approved',  email_enabled: true },
  { activity_type: 'spotlight_rejected',    category: 'Spotlight',             label: 'Spotlight request rejected',  email_enabled: true },
  { activity_type: 'support_reply',         category: 'Support',               label: 'Support ticket reply',        email_enabled: true },
];

@Injectable()
export class NotificationSettingsService {
  private cache = new Map<string, NotificationSetting>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(NotificationSetting)
    private readonly repo: Repository<NotificationSetting>,
  ) {}

  async ensureSeeded(): Promise<void> {
    const existing = await this.repo.find({ select: ['activity_type'] });
    const have = new Set(existing.map((r) => r.activity_type));
    const missing = SEED.filter((s) => !have.has(s.activity_type));
    if (missing.length) {
      await this.repo.insert(missing.map((s) => ({
        activity_type: s.activity_type,
        category: s.category,
        label: s.label,
        email_enabled: s.email_enabled,
        push_enabled: true,
        in_app_enabled: true,
      })));
      this.invalidateCache();
    }
  }

  async getAll(): Promise<NotificationSetting[]> {
    await this.ensureSeeded();
    return this.repo.find({ order: { category: 'ASC', label: 'ASC' } });
  }

  async update(
    activityType: string,
    patch: Partial<Pick<NotificationSetting, 'email_enabled' | 'push_enabled' | 'in_app_enabled'>>,
  ): Promise<NotificationSetting | null> {
    await this.repo.update({ activity_type: activityType }, patch);
    this.invalidateCache();
    return this.repo.findOne({ where: { activity_type: activityType } });
  }

  invalidateCache(): void {
    this.cacheLoadedAt = 0;
  }

  private async ensureCache(): Promise<void> {
    if (Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return;
    const rows = await this.repo.find();
    this.cache = new Map(rows.map((r) => [r.activity_type, r]));
    this.cacheLoadedAt = Date.now();
  }

  /**
   * Fail-open: a type with no row yet (e.g. a brand new notification kind
   * shipped before an admin has configured it) behaves as if fully enabled,
   * so adding a new notification type never silently disables itself.
   */
  async isEnabled(activityType: string, channel: NotificationChannel): Promise<boolean> {
    await this.ensureCache();
    const row = this.cache.get(activityType);
    if (!row) return true;
    if (channel === 'email') return row.email_enabled;
    if (channel === 'push') return row.push_enabled;
    return row.in_app_enabled;
  }
}
