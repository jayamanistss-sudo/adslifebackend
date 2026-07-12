import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { User } from '../entities/user.entity';
import { FraudConfigService, FraudConfig } from './fraud-config.service';

@Injectable()
export class FraudDetectorService {
  constructor(
    @InjectRepository(FraudFlag) private readonly fraudFlagRepo: Repository<FraudFlag>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    private readonly fraudConfig: FraudConfigService,
  ) {}

  async checkVendor(vendorId: number) {
    const rules = await this.fraudConfig.getConfig();
    const vendor = await this.vendorRepo
      .createQueryBuilder('v')
      .innerJoin(User, 'u', 'u.id = v.user_id')
      .select(['v.*', 'u.created_at AS user_created_at'])
      .where('v.id = :id', { id: vendorId })
      .getRawOne();
    if (!vendor) return { score: 0, flags: [], action: 'none' };

    let score = 0; const flags: string[] = [];

    const dupName = await this.vendorRepo
      .createQueryBuilder('v')
      .where('v.id != :id', { id: vendorId })
      .andWhere("v.status != 'rejected'")
      .andWhere('(SOUNDEX(v.business_name) = SOUNDEX(:name) OR v.business_name = :exact)', {
        name: vendor.business_name,
        exact: vendor.business_name,
      })
      .getOne();
    if (dupName) { score += rules.duplicate_business_name; flags.push('duplicate_business_name'); }

    if (!vendor.website && !vendor.gst_number) {
      score += rules.no_website_no_gst; flags.push('no_website_no_gst');
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const bulkCount = await this.offerRepo
      .createQueryBuilder('o')
      .where('o.vendor_id = :id', { id: vendorId })
      .andWhere('o.created_at >= :since', { since: oneHourAgo })
      .getCount();
    if (bulkCount > 10) { score += rules.bulk_offer_creation; flags.push('bulk_offer_creation'); }

    const phone = (vendor.phone || '').replace(/\D/g, '');
    if (phone && (/^(\d)\1{9,}$/.test(phone) || ['1234567890', '9876543210', '0000000000'].includes(phone))) {
      score += rules.invalid_phone_pattern; flags.push('invalid_phone_pattern');
    }

    if (!vendor.lat || !vendor.lng) { score += rules.missing_location_data; flags.push('missing_location_data'); }

    const ageHours = (Date.now() - new Date(vendor.user_created_at).getTime()) / 3600000;
    const offerCount = await this.offerRepo.count({ where: { vendor_id: vendorId } });
    if (ageHours < 24 && offerCount > 5) {
      score += rules.newly_registered_bulk_post; flags.push('newly_registered_bulk_post');
    }

    return this.buildResult(score, flags, 'vendor', vendorId, rules);
  }

  async checkOffer(offerId: number) {
    const rules = await this.fraudConfig.getConfig();
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) return { score: 0, flags: [], action: 'none' };

    let score = 0; const flags: string[] = [];

    if (Number.parseFloat(String(offer.discount_percent)) > 80) {
      score += rules.suspicious_discount; flags.push('suspicious_discount');
    }

    if (offer.description) {
      const dup = await this.offerRepo
        .createQueryBuilder('o')
        .where('MD5(o.description) = MD5(:desc)', { desc: offer.description })
        .andWhere('o.id != :id', { id: offerId })
        .getOne();
      if (dup) { score += rules.copied_description; flags.push('copied_description'); }
    }

    return this.buildResult(score, flags, 'offer', offerId, rules);
  }

  private async buildResult(score: number, flags: string[], type: string, entityId: number, rules: FraudConfig) {
    let action: string;
    if (score >= rules.auto_reject_threshold) action = 'auto_reject';
    else if (score >= rules.flag_review_threshold) action = 'flag_review';
    else action = 'none';

    const riskLevel = score >= rules.auto_reject_threshold ? 'high' : score >= rules.flag_review_threshold ? 'medium' : 'low';

    if (action !== 'none') {
      // find-then-insert/update raced against a unique (entity_type,
      // entity_id) constraint on this table (see fraud-flag.entity.ts) —
      // two concurrent checks for the same entity (e.g. a vendor's own
      // bulk_offer_creation rule firing repeatedly) could both see "no
      // existing flag" and both try to insert, so the loser hit an
      // unhandled duplicate-key error instead of just updating. A single
      // upsert against that same constraint is atomic and needs no lock.
      await this.fraudFlagRepo.upsert(
        {
          entity_type: type as any,
          entity_id: entityId,
          flag_reason: flags.join(', '),
          confidence_score: score,
        },
        ['entity_type', 'entity_id'],
      );
    }
    return { score, flags, action, max_score: 100, risk_level: riskLevel };
  }
}
