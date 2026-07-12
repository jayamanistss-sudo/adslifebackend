import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Vendor } from '../entities/vendor.entity';
import { PushService } from '../services/push.service';

const FREE_PLAN_SLUG = 'starter';

@Injectable()
export class PlanExpiryService {
  private readonly logger = new Logger(PlanExpiryService.name);

  constructor(
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    private readonly push: PushService,
  ) {}

  /**
   * Daily sweep: any vendor whose plan_expires_at has passed gets downgraded
   * to the free plan and notified. Without this, a vendor who doesn't renew
   * keeps full paid-plan benefits (max_offers, etc.) forever.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async downgradeExpiredPlans(): Promise<void> {
    const expired = await this.vendorRepo.find({
      where: { plan_expires_at: LessThan(new Date()) },
      select: ['id', 'user_id', 'business_name', 'subscription_plan'],
    });
    const toDowngrade = expired.filter((v) => v.subscription_plan !== FREE_PLAN_SLUG);
    if (!toDowngrade.length) return;

    this.logger.log(`Downgrading ${toDowngrade.length} expired vendor plan(s) to starter`);

    for (const vendor of toDowngrade) {
      await this.vendorRepo.update(vendor.id, {
        subscription_plan: FREE_PLAN_SLUG,
        plan_expires_at: null,
      });
      await this.push.send(
        vendor.user_id,
        'Your plan has expired',
        `${vendor.business_name}'s subscription has ended and moved to the Starter plan. Renew anytime to restore your benefits.`,
        { type: 'plan_expired' },
      );
    }
  }
}
