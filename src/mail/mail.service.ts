import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transporter = process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`Would send "${subject}" to ${to} (SMTP not configured)`);
      return;
    }
    await this.transporter.sendMail({
      from: `"AdsLife" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  }

  async sendWelcomeEmail(toEmail: string, name: string): Promise<void> {
    const appUrl = process.env.APP_URL || 'https://adslife.in';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:16px;color:#333;">Welcome to AdsLife, <strong>${name}</strong> 🎉</p>
          <p style="color:#555;font-size:14px;line-height:1.6;">
            You're all set! Start exploring hyperlocal deals near you, save offers you like,
            and earn coins every time you redeem one.
          </p>
          <a href="${appUrl}/feed" style="display:block;text-align:center;background:#FF6200;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;margin:20px 0;">
            Explore Offers Near You
          </a>
          <p style="color:#aaa;font-size:11px;text-align:center;">
            Questions? Just reply to this email — we're happy to help.
          </p>
        </div>
      </div>`;

    try {
      await this.send(toEmail, 'Welcome to AdsLife 🎉', html);
    } catch (err: any) {
      this.logger.warn(`Welcome email failed for ${toEmail}: ${err.message}`);
    }
  }

  async sendVendorApprovedEmail(toEmail: string, name: string, businessName: string): Promise<void> {
    const appUrl = process.env.APP_URL || 'https://adslife.in';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:16px;color:#333;">Congratulations, <strong>${name}</strong> 🎉</p>
          <p style="color:#555;font-size:14px;line-height:1.6;">
            <strong>${businessName}</strong> has been approved as a vendor on AdsLife. You can now post
            offers, track analytics, and reach customers near your shop.
          </p>
          <a href="${appUrl}/profile" style="display:block;text-align:center;background:#FF6200;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;margin:20px 0;">
            Go to Vendor Dashboard
          </a>
          <p style="color:#aaa;font-size:11px;text-align:center;">
            Questions? Just reply to this email — we're happy to help.
          </p>
        </div>
      </div>`;

    try {
      await this.send(toEmail, 'Your AdsLife vendor application is approved! 🎉', html);
    } catch (err: any) {
      this.logger.warn(`Vendor approved email failed for ${toEmail}: ${err.message}`);
    }
  }

  async sendVendorRejectedEmail(toEmail: string, name: string, businessName: string, note?: string): Promise<void> {
    const appUrl = process.env.APP_URL || 'https://adslife.in';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:16px;color:#333;">Hi <strong>${name}</strong>,</p>
          <p style="color:#555;font-size:14px;line-height:1.6;">
            Thanks for applying with <strong>${businessName}</strong>. We weren't able to approve your
            vendor application this time.
          </p>
          ${note ? `<p style="color:#555;font-size:14px;line-height:1.6;background:#fafafa;border-left:3px solid #FF6200;padding:10px 14px;border-radius:6px;">${note}</p>` : ''}
          <p style="color:#555;font-size:14px;line-height:1.6;">
            You're welcome to update your details and reapply anytime.
          </p>
          <a href="${appUrl}/profile" style="display:block;text-align:center;background:#FF6200;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;margin:20px 0;">
            View Application
          </a>
        </div>
      </div>`;

    try {
      await this.send(toEmail, 'Update on your AdsLife vendor application', html);
    } catch (err: any) {
      this.logger.warn(`Vendor rejected email failed for ${toEmail}: ${err.message}`);
    }
  }
}
