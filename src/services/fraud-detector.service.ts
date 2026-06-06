import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { User } from '../entities/user.entity';

const RULES: Record<string, number> = {
  duplicate_business_name: 25, suspicious_discount: 20, no_website_no_gst: 15,
  bulk_offer_creation: 20, copied_description: 25, invalid_phone_pattern: 15,
  missing_location_data: 10, newly_registered_bulk_post: 20,
};

@Injectable()
export class FraudDetectorService {
  constructor(
    @InjectRepository(FraudFlag) private readonly fraudFlagRepo: Repository<FraudFlag>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
  ) {}

  async checkVendor(vendorId: number) {
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
    if (dupName) { score += RULES.duplicate_business_name; flags.push('duplicate_business_name'); }

    if (!vendor.website && !vendor.gst_number) {
      score += RULES.no_website_no_gst; flags.push('no_website_no_gst');
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const bulkCount = await this.offerRepo
      .createQueryBuilder('o')
      .where('o.vendor_id = :id', { id: vendorId })
      .andWhere('o.created_at >= :since', { since: oneHourAgo })
      .getCount();
    if (bulkCount > 10) { score += RULES.bulk_offer_creation; flags.push('bulk_offer_creation'); }

    const phone = (vendor.phone || '').replace(/\D/g, '');
    if (phone && (/^(\d)\1{9,}$/.test(phone) || ['1234567890', '9876543210', '0000000000'].includes(phone))) {
      score += RULES.invalid_phone_pattern; flags.push('invalid_phone_pattern');
    }

    if (!vendor.lat || !vendor.lng) { score += RULES.missing_location_data; flags.push('missing_location_data'); }

    const ageHours = (Date.now() - new Date(vendor.user_created_at).getTime()) / 3600000;
    const offerCount = await this.offerRepo.count({ where: { vendor_id: vendorId } });
    if (ageHours < 24 && offerCount > 5) {
      score += RULES.newly_registered_bulk_post; flags.push('newly_registered_bulk_post');
    }

    return this.buildResult(score, flags, 'vendor', vendorId);
  }

  async checkOffer(offerId: number) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) return { score: 0, flags: [], action: 'none' };

    let score = 0; const flags: string[] = [];

    if (Number.parseFloat(String(offer.discount_percent)) > 80) {
      score += RULES.suspicious_discount; flags.push('suspicious_discount');
    }

    if (offer.description) {
      const dup = await this.offerRepo
        .createQueryBuilder('o')
        .where('MD5(o.description) = MD5(:desc)', { desc: offer.description })
        .andWhere('o.id != :id', { id: offerId })
        .getOne();
      if (dup) { score += RULES.copied_description; flags.push('copied_description'); }
    }

    return this.buildResult(score, flags, 'offer', offerId);
  }

  private async buildResult(score: number, flags: string[], type: string, entityId: number) {
    let action: string;
    if (score >= 85) action = 'auto_reject';
    else if (score >= 60) action = 'flag_review';
    else action = 'none';

    const riskLevel = score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low';

    if (action !== 'none') {
      const existing = await this.fraudFlagRepo.findOne({
        where: { entity_type: type as any, entity_id: entityId },
      });
      if (existing) {
        await this.fraudFlagRepo.update(existing.id, {
          flag_reason: flags.join(', '),
          confidence_score: score,
        });
      } else {
        await this.fraudFlagRepo.save({
          entity_type: type as any,
          entity_id: entityId,
          flag_reason: flags.join(', '),
          confidence_score: score,
        });
      }
    }
    return { score, flags, action, max_score: 100, risk_level: riskLevel };
  }
}
