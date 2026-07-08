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

  async sendEmailChangeOtp(toEmail: string, name: string, otp: string): Promise<void> {
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:16px;color:#333;">Hi <strong>${name}</strong>,</p>
          <p style="color:#555;font-size:14px;line-height:1.6;">
            Use the code below to confirm this is your new email address. It expires in 15 minutes.
          </p>
          <div style="background:#fff8f4;border:1px solid #ffe0cc;border-radius:10px;padding:18px;margin:20px 0;text-align:center;">
            <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#FF6200;">${otp}</span>
          </div>
          <p style="color:#aaa;font-size:11px;text-align:center;">
            Didn't request this? You can safely ignore this email.
          </p>
        </div>
      </div>`;

    try {
      await this.send(toEmail, `${otp} is your AdsLife verification code`, html);
    } catch (err: any) {
      this.logger.warn(`Email change OTP failed for ${toEmail}: ${err.message}`);
    }
  }

  async sendVendorApprovedEmail(toEmail: string, name: string, businessName: string): Promise<void> {
    const appUrl = process.env.APP_URL || 'https://adslife.in';
    const loginUrl = `${appUrl}/login`;
    const dashboardUrl = `${appUrl}/vendor/dashboard`;
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:16px;color:#333;">Congratulations, <strong>${name}</strong> 🎉</p>
          <p style="color:#555;font-size:14px;line-height:1.6;">
            <strong>${businessName}</strong> has been approved as a vendor on AdsLife! You can now post
            offers, track analytics, and reach customers near your shop.
          </p>

          <div style="background:#fff8f4;border:1px solid #ffe0cc;border-radius:10px;padding:18px 20px;margin:20px 0;">
            <p style="color:#333;font-size:14px;font-weight:600;margin:0 0 12px;">How to get started:</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:28px;vertical-align:top;padding:4px 0;">
                  <span style="display:inline-block;background:#FF6200;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;font-size:12px;line-height:20px;font-weight:700;">1</span>
                </td>
                <td style="padding:4px 0 4px 10px;color:#555;font-size:13px;line-height:1.6;">
                  Open the AdsLife app or visit
                  <a href="${loginUrl}" style="color:#FF6200;text-decoration:none;font-weight:600;">dev.adslife.in</a>
                </td>
              </tr>
              <tr>
                <td style="width:28px;vertical-align:top;padding:4px 0;">
                  <span style="display:inline-block;background:#FF6200;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;font-size:12px;line-height:20px;font-weight:700;">2</span>
                </td>
                <td style="padding:4px 0 4px 10px;color:#555;font-size:13px;line-height:1.6;">
                  Log in with your registered email &amp; password
                  <span style="display:block;color:#999;font-size:12px;">(${toEmail})</span>
                </td>
              </tr>
              <tr>
                <td style="width:28px;vertical-align:top;padding:4px 0;">
                  <span style="display:inline-block;background:#FF6200;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;font-size:12px;line-height:20px;font-weight:700;">3</span>
                </td>
                <td style="padding:4px 0 4px 10px;color:#555;font-size:13px;line-height:1.6;">
                  Tap the <strong>Vendor Dashboard</strong> from your profile to start adding offers
                </td>
              </tr>
            </table>
          </div>

          <a href="${loginUrl}" style="display:block;text-align:center;background:#FF6200;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;margin:20px 0;">
            Log In &amp; Go to Vendor Dashboard
          </a>

          <p style="color:#888;font-size:12px;line-height:1.6;border-top:1px solid #eee;padding-top:14px;margin-top:4px;">
            Direct link to your dashboard:
            <a href="${dashboardUrl}" style="color:#FF6200;word-break:break-all;">${dashboardUrl}</a>
          </p>
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

  async sendNewOfferEmail(toEmail: string, userName: string, businessName: string, offerTitle: string, offerId: number, discountPercent?: number): Promise<void> {
    const appUrl = process.env.APP_URL || 'https://adslife.in';
    const offerUrl = `${appUrl}/offer/${offerId}`;
    const discount = discountPercent ? ` — <strong>${discountPercent}% OFF</strong>` : '';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:15px;color:#333;">Hi <strong>${userName}</strong>,</p>
          <p style="color:#555;font-size:14px;line-height:1.6;">
            <strong>${businessName}</strong>, a shop you follow, just posted a new offer:
          </p>
          <div style="background:#fff8f4;border:1px solid #ffe0cc;border-radius:10px;padding:16px 20px;margin:16px 0;">
            <p style="color:#FF6200;font-size:16px;font-weight:700;margin:0;">${offerTitle}${discount}</p>
          </div>
          <a href="${offerUrl}" style="display:block;text-align:center;background:#FF6200;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;margin:20px 0;">
            View Offer
          </a>
          <p style="color:#aaa;font-size:11px;text-align:center;">
            You're receiving this because you subscribed to ${businessName} on AdsLife.<br>
            Open the app → Settings → Notifications to manage email alerts.
          </p>
        </div>
      </div>`;

    try {
      await this.send(toEmail, `New offer from ${businessName}: ${offerTitle}`, html);
    } catch (err: any) {
      this.logger.warn(`New offer email failed for ${toEmail}: ${err.message}`);
    }
  }

  /** Shared branded wrapper for simple one-off status updates (banner/spotlight/support)
   *  that don't warrant a fully bespoke template like the lifecycle emails above. */
  async sendStatusEmail(
    toEmail: string, name: string, headline: string, message: string,
    ctaLabel?: string, ctaUrl?: string,
  ): Promise<void> {
    const cta = ctaLabel && ctaUrl ? `
          <a href="${ctaUrl}" style="display:block;text-align:center;background:#FF6200;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;margin:20px 0;">
            ${ctaLabel}
          </a>` : '';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;">
        <div style="background:#FF6200;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">AdsLife</h1>
          <p style="color:#ffe0cc;margin:4px 0 0;font-size:13px;">Discover · Earn · Win</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
          <p style="font-size:16px;color:#333;">Hi <strong>${name}</strong>,</p>
          <p style="color:#555;font-size:14px;line-height:1.6;">${message}</p>
          ${cta}
        </div>
      </div>`;

    try {
      await this.send(toEmail, headline, html);
    } catch (err: any) {
      this.logger.warn(`Status email "${headline}" failed for ${toEmail}: ${err.message}`);
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
