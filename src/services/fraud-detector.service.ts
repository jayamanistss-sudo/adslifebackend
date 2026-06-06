import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const RULES: Record<string, number> = {
  duplicate_business_name: 25, suspicious_discount: 20, no_website_no_gst: 15,
  bulk_offer_creation: 20, copied_description: 25, invalid_phone_pattern: 15,
  missing_location_data: 10, newly_registered_bulk_post: 20,
};

@Injectable()
export class FraudDetectorService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async checkVendor(vendorId: number) {
    const [vendor] = await this.db.query(
      'SELECT v.*, u.created_at as user_created_at FROM vendors v JOIN users u ON v.user_id = u.id WHERE v.id = $1',
      [vendorId],
    );
    if (!vendor) return { score: 0, flags: [], action: 'none' };

    let score = 0; const flags: string[] = [];

    const [dupName] = await this.db.query(
      `SELECT id FROM vendors
       WHERE id != $1 AND status != 'rejected'
         AND (SOUNDEX(business_name) = SOUNDEX($2) OR business_name = $3)
       LIMIT 1`,
      [vendorId, vendor.business_name, vendor.business_name],
    );
    if (dupName) { score += RULES.duplicate_business_name; flags.push('duplicate_business_name'); }

    if (!vendor.website && !vendor.gst_number) {
      score += RULES.no_website_no_gst; flags.push('no_website_no_gst');
    }

    const [bulk] = await this.db.query(
      'SELECT COUNT(*) as cnt FROM offers WHERE vendor_id = $1 AND created_at >= NOW() - INTERVAL \'1 hour\'',
      [vendorId],
    );
    if (+bulk.cnt > 10) { score += RULES.bulk_offer_creation; flags.push('bulk_offer_creation'); }

    const phone = (vendor.phone || '').replace(/\D/g, '');
    if (phone && (/^(\d)\1{9,}$/.test(phone) || ['1234567890', '9876543210', '0000000000'].includes(phone))) {
      score += RULES.invalid_phone_pattern; flags.push('invalid_phone_pattern');
    }

    if (!vendor.lat || !vendor.lng) { score += RULES.missing_location_data; flags.push('missing_location_data'); }

    const ageHours = (Date.now() - new Date(vendor.user_created_at).getTime()) / 3600000;
    const [offerCount] = await this.db.query('SELECT COUNT(*) as cnt FROM offers WHERE vendor_id = $1', [vendorId]);
    if (ageHours < 24 && +offerCount.cnt > 5) {
      score += RULES.newly_registered_bulk_post; flags.push('newly_registered_bulk_post');
    }

    return this.buildResult(score, flags, 'vendor', vendorId);
  }

  async checkOffer(offerId: number) {
    const [offer] = await this.db.query('SELECT * FROM offers WHERE id = $1', [offerId]);
    if (!offer) return { score: 0, flags: [], action: 'none' };

    let score = 0; const flags: string[] = [];

    if (Number.parseFloat(offer.discount_percent) > 80) {
      score += RULES.suspicious_discount; flags.push('suspicious_discount');
    }

    if (offer.description) {
      const [dup] = await this.db.query(
        'SELECT id FROM offers WHERE MD5(description) = MD5($1) AND id != $2 LIMIT 1',
        [offer.description, offerId],
      );
      if (dup) { score += RULES.copied_description; flags.push('copied_description'); }
    }

    return this.buildResult(score, flags, 'offer', offerId);
  }

  private async buildResult(score: number, flags: string[], type: string, entityId: number) {
    let action: string;
    if (score >= 85) action = 'auto_reject';
    else if (score >= 60) action = 'flag_review';
    else action = 'none';

    let riskLevel: string;
    if (score >= 85) riskLevel = 'high';
    else if (score >= 60) riskLevel = 'medium';
    else riskLevel = 'low';

    if (action !== 'none') {
      await this.db.query(
        `INSERT INTO fraud_flags (entity_type, entity_id, flag_reason, confidence_score) VALUES ($1,$2,$3,$4)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET flag_reason=EXCLUDED.flag_reason, confidence_score=EXCLUDED.confidence_score`,
        [type, entityId, flags.join(', '), score],
      );
    }
    return { score, flags, action, max_score: 100, risk_level: riskLevel };
  }
}
