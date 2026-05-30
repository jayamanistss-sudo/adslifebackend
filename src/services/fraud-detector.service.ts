import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const RULES: Record<string, number> = {
  duplicate_business_name: 25, suspicious_discount: 20, no_website_no_gst: 15,
  bulk_offer_creation: 20, copied_description: 25, invalid_phone_pattern: 15,
  missing_location_data: 10, newly_registered_bulk_post: 20,
};

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}

@Injectable()
export class FraudDetectorService {
  constructor(@InjectDataSource() private db: DataSource) {}

  async checkVendor(vendorId: number) {
    const [vendor] = await this.db.query(
      'SELECT v.*, u.created_at as user_created_at FROM vendors v JOIN users u ON v.user_id = u.id WHERE v.id = ?',
      [vendorId],
    );
    if (!vendor) return { score: 0, flags: [], action: 'none' };

    let score = 0; const flags: string[] = [];

    const others = await this.db.query(
      'SELECT id, business_name FROM vendors WHERE id != ? AND status != "rejected"',
      [vendorId],
    );
    for (const v of others) {
      if (levenshtein(vendor.business_name.toLowerCase(), v.business_name.toLowerCase()) < 3) {
        score += RULES.duplicate_business_name; flags.push('duplicate_business_name'); break;
      }
    }

    if (!vendor.website && !vendor.gst_number) {
      score += RULES.no_website_no_gst; flags.push('no_website_no_gst');
    }

    const [[bulk]] = await Promise.all([
      this.db.query(
        'SELECT COUNT(*) as cnt FROM offers WHERE vendor_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
        [vendorId],
      ),
    ]);
    if (+bulk.cnt > 10) { score += RULES.bulk_offer_creation; flags.push('bulk_offer_creation'); }

    const phone = (vendor.phone || '').replace(/\D/g, '');
    if (phone && (/^(\d)\1{9,}$/.test(phone) || ['1234567890', '9876543210', '0000000000'].includes(phone))) {
      score += RULES.invalid_phone_pattern; flags.push('invalid_phone_pattern');
    }

    if (!vendor.lat || !vendor.lng) { score += RULES.missing_location_data; flags.push('missing_location_data'); }

    const ageHours = (Date.now() - new Date(vendor.user_created_at).getTime()) / 3600000;
    const [[offerCount]] = [await this.db.query('SELECT COUNT(*) as cnt FROM offers WHERE vendor_id = ?', [vendorId])];
    if (ageHours < 24 && +offerCount.cnt > 5) {
      score += RULES.newly_registered_bulk_post; flags.push('newly_registered_bulk_post');
    }

    return this.buildResult(score, flags, 'vendor', vendorId);
  }

  async checkOffer(offerId: number) {
    const [offer] = await this.db.query('SELECT * FROM offers WHERE id = ?', [offerId]);
    if (!offer) return { score: 0, flags: [], action: 'none' };

    let score = 0; const flags: string[] = [];

    if (parseFloat(offer.discount_percent) > 80) {
      score += RULES.suspicious_discount; flags.push('suspicious_discount');
    }

    if (offer.description) {
      const [dup] = await this.db.query(
        'SELECT id FROM offers WHERE MD5(description) = MD5(?) AND id != ? LIMIT 1',
        [offer.description, offerId],
      );
      if (dup) { score += RULES.copied_description; flags.push('copied_description'); }
    }

    return this.buildResult(score, flags, 'offer', offerId);
  }

  private async buildResult(score: number, flags: string[], type: string, entityId: number) {
    const action = score >= 85 ? 'auto_reject' : score >= 60 ? 'flag_review' : 'none';
    if (action !== 'none') {
      await this.db.query(
        `INSERT INTO fraud_flags (entity_type, entity_id, flag_reason, confidence_score) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE flag_reason=VALUES(flag_reason), confidence_score=VALUES(confidence_score)`,
        [type, entityId, flags.join(', '), score],
      );
    }
    return {
      score, flags, action, max_score: 100,
      risk_level: score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low',
    };
  }
}
