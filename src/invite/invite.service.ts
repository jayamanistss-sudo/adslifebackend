import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { User } from '../entities/user.entity';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';

@Injectable()
export class InviteService {
  private readonly transporter = process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
  ) {}

  private escapeHtml(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#x27;');
  }

  async sendInviteEmail(senderId: number, toEmail: string, offerId?: number, customMessage?: string) {
    const sender = await this.userRepo.findOne({
      where: { id: senderId },
      select: ['name', 'referral_code'],
    });
    if (!sender) throw new InternalServerErrorException('Sender not found');

    const appUrl = process.env.APP_URL || 'https://adslife.in';
    const refLink = `${appUrl}/register?ref=${sender.referral_code}`;

    let offerSection = '';
    if (offerId) {
      const offerRow = await this.offerRepo
        .createQueryBuilder('o')
        .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
        .select(['o.title AS title', 'o.discount_percent AS discount_percent', 'v.business_name AS business_name'])
        .where('o.id = :id', { id: offerId })
        .getRawOne();
      if (offerRow) {
        offerSection = `
          <div style="background:#fff3e0;border-left:4px solid #FF6200;padding:16px;border-radius:8px;margin:16px 0;">
            <p style="margin:0;font-weight:600;color:#FF6200;">${offerRow.discount_percent}% OFF</p>
            <p style="margin:4px 0 0;color:#333;">${offerRow.title} — ${offerRow.business_name}</p>
            <a href="${appUrl}/offer/${offerId}" style="display:inline-block;margin-top:10px;background:#FF6200;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;font-size:14px;">View Offer</a>
          </div>`;
      }
    }

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:16px;color:#333;"><strong>${sender.name}</strong> invited you to join AdsLife — discover the best local offers near you and earn coins every time you explore!</p>
          ${offerSection}
          ${customMessage ? `<p style="color:#555;font-style:italic;">"${this.escapeHtml(customMessage)}"</p>` : ''}
          <p style="color:#888;font-size:13px;">Join using this referral link and both of you get bonus coins:</p>
          <a href="${refLink}" style="display:block;text-align:center;background:#FF6200;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;margin:16px 0;">
            Join AdsLife — Get 20 Coins Free 🎉
          </a>
          <p style="color:#aaa;font-size:11px;text-align:center;">Or copy this link: ${refLink}</p>
        </div>
      </div>`;

    if (!this.transporter) {
      console.log(`[Invite] Would send to ${toEmail} from ${sender.name} (SMTP not configured)`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"AdsLife" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `${sender.name} invited you to AdsLife 🎉`,
        html,
      });
    } catch (err) {
      console.error('[Invite] Email send failed:', err.message);
      throw new InternalServerErrorException('Failed to send invite email');
    }
  }
}
