import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferReport, OfferReportReason } from '../entities/offer-report.entity';
import { FraudFlag, FraudEntityType, FraudFlagStatus } from '../entities/fraud-flag.entity';

const VALID_REASONS = Object.values(OfferReportReason);
const CONFIDENCE_PER_REPORT = 15;
const MAX_CONFIDENCE = 100;

@Injectable()
export class OfferReportsService {
  constructor(
    @InjectRepository(OfferReport) private readonly reportRepo: Repository<OfferReport>,
    @InjectRepository(FraudFlag) private readonly fraudFlagRepo: Repository<FraudFlag>,
  ) {}

  async report(offerId: number, userId: number, reason: string, details?: string) {
    if (!VALID_REASONS.includes(reason as OfferReportReason)) {
      throw new BadRequestException(`reason must be one of: ${VALID_REASONS.join(', ')}`);
    }

    const existing = await this.reportRepo.findOne({ where: { offer_id: offerId, user_id: userId } });
    const isNewReporter = !existing;

    if (existing) {
      existing.reason = reason as OfferReportReason;
      existing.details = details ?? null;
      await this.reportRepo.save(existing);
    } else {
      await this.reportRepo.save(
        this.reportRepo.create({ offer_id: offerId, user_id: userId, reason: reason as OfferReportReason, details: details ?? null }),
      );
    }

    // Only bump the shared fraud-flag confidence score for genuinely new reporters,
    // so repeatedly editing one's own report doesn't inflate the score.
    if (isNewReporter) {
      await this.syncFraudFlag(offerId, reason, details);
    }

    return { reported: true };
  }

  private async syncFraudFlag(offerId: number, reason: string, details?: string) {
    const note = `[user report] ${reason}${details ? `: ${details}` : ''}`;
    const existing = await this.fraudFlagRepo.findOne({
      where: { entity_type: FraudEntityType.OFFER, entity_id: offerId },
    });

    if (existing) {
      existing.confidence_score = Math.min(MAX_CONFIDENCE, (existing.confidence_score ?? 0) + CONFIDENCE_PER_REPORT);
      existing.flag_reason = existing.flag_reason ? `${existing.flag_reason}\n${note}` : note;
      if (existing.status === FraudFlagStatus.DISMISSED) existing.status = FraudFlagStatus.PENDING;
      await this.fraudFlagRepo.save(existing);
    } else {
      await this.fraudFlagRepo.save(
        this.fraudFlagRepo.create({
          entity_type: FraudEntityType.OFFER,
          entity_id: offerId,
          flag_reason: note,
          confidence_score: CONFIDENCE_PER_REPORT,
          status: FraudFlagStatus.PENDING,
        }),
      );
    }
  }
}
