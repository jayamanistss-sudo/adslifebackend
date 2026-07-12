import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { BecomeVendorDto } from './dto/google-auth.dto';
import { ReferralService } from '../referral/referral.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { MailService } from '../mail/mail.service';
import { User } from '../entities/user.entity';
import { Vendor } from '../entities/vendor.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { UserLocation } from '../entities/user-location.entity';
import { EmailChangeRequest } from '../entities/email-change-request.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SiteSetting } from '../entities/site-setting.entity';
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../common/constants/password-policy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(UserPreference) private readonly userPrefRepo: Repository<UserPreference>,
    @InjectRepository(PasswordReset) private readonly passwordResetRepo: Repository<PasswordReset>,
    @InjectRepository(UserLocation) private readonly userLocationRepo: Repository<UserLocation>,
    @InjectRepository(EmailChangeRequest) private readonly emailChangeRepo: Repository<EmailChangeRequest>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly referral: ReferralService,
    private readonly monitoring: MonitoringService,
    private readonly mail: MailService,
  ) {}

  async login(dto: LoginDto, ctx?: { ip: string; ua: string; requestId?: string }) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.trim(), is_active: true },
      select: ['id', 'name', 'email', 'password_hash', 'role', 'city', 'lat', 'lng', 'avatar_url'],
    });
    if (!user?.password_hash) {
      setImmediate(() => this.monitoring.logAuth({
        requestId: ctx?.requestId, email: dto.email, action: 'login_failure',
        ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
        failureReason: 'User not found or inactive',
      }).catch(() => {}));
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!(await bcrypt.compare(dto.password, user.password_hash))) {
      setImmediate(() => {
        this.monitoring.logAuth({
          requestId: ctx?.requestId, userId: user.id, email: user.email,
          role: user.role, action: 'login_failure',
          ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
          failureReason: 'Wrong password',
        }).catch(() => {});
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.userRepo.increment({ id: user.id }, 'login_count', 1);
    await this.userRepo.update(user.id, { last_login: new Date() });
    setImmediate(() => this.monitoring.logAuth({
      requestId: ctx?.requestId, userId: user.id, email: user.email,
      role: user.role, action: 'login_success',
      ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
    }).catch(() => {}));
    if (dto.lat != null && dto.lng != null) {
      setImmediate(() =>
        this.updateLocation(user.id, dto.lat!, dto.lng!, dto.city, dto.accuracy, 'gps').catch(() => {}),
      );
    }
    const token = this.generateToken(user.id, user.role);
    const { password_hash: _pw, ...userOut } = user as any;
    return { user: userOut, token };
  }

  async register(dto: RegisterDto, ctx?: { ip: string; ua: string; requestId?: string }) {
    if (!dto.name || !dto.email || !dto.password) {
      throw new BadRequestException('Name, email and password are required');
    }
    const existing = await this.userRepo.findOne({ where: { email: dto.email }, select: ['id'] });
    if (existing) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 10);
    const role = 'user';

    const userId: number = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const userPrefRepo = manager.getRepository(UserPreference);

      const newUser = userRepo.create({
        name: dto.name.trim(),
        email: dto.email.trim(),
        phone: dto.phone?.trim() || null,
        password_hash: hash,
        city: dto.city?.trim() || null,
        role: role as any,
      });
      const saved = await userRepo.save(newUser);
      const newId: number = saved.id;

      await userPrefRepo
        .createQueryBuilder()
        .insert()
        .into(UserPreference)
        .values({ user_id: newId, preferred_categories: '[]' as any, preferred_vendors: '[]' as any })
        .orIgnore()
        .execute();

      return newId;
    });

    await this.referral.ensureCode(userId);
    if (dto.ref) await this.referral.applyReferral(userId, dto.ref.toUpperCase());

    setImmediate(() => this.monitoring.logAuth({
      requestId: ctx?.requestId, userId, email: dto.email, role,
      action: 'register', ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
    }).catch(() => {}));

    setImmediate(() => this.mail.sendWelcomeEmail(dto.email.trim(), dto.name.trim()));

    const token = this.generateToken(userId, role);
    return { user: { id: userId, name: dto.name, email: dto.email, role }, token };
  }

  async googleAuth(accessToken: string) {
    const { data: profile } = await axios.get(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!profile?.email) throw new BadRequestException('Invalid Google token');

    const clientId = this.config.get<string>('googleClientId');
    if (clientId && profile.aud && profile.aud !== clientId) {
      throw new UnauthorizedException('Google token was not issued for this application');
    }

    const existing = await this.userRepo.findOne({
      where: { email: profile.email },
      select: ['id', 'name', 'email', 'role', 'avatar_url'],
    });

    let userId: number;
    let role = 'user';

    if (existing) {
      userId = existing.id;
      role = existing.role;
      await this.userRepo.increment({ id: userId }, 'login_count', 1);
      await this.userRepo.update(userId, {
        last_login: new Date(),
        avatar_url: existing.avatar_url ?? (profile.picture || null),
      });
    } else {
      const newUser = this.userRepo.create({
        name: profile.name || profile.email,
        email: profile.email,
        avatar_url: profile.picture || null,
        role: 'user' as any,
        google_id: profile.sub || null,
      });
      const saved = await this.userRepo.save(newUser);
      userId = saved.id;

      await this.userPrefRepo
        .createQueryBuilder()
        .insert()
        .into(UserPreference)
        .values({ user_id: userId, preferred_categories: '[]' as any, preferred_vendors: '[]' as any })
        .orIgnore()
        .execute();

      setImmediate(() => this.mail.sendWelcomeEmail(profile.email, profile.name || profile.email));
    }

    const token = this.generateToken(userId, role);
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name', 'email', 'role', 'avatar_url'],
    });
    if (!user) throw new NotFoundException('User not found');
    return { user, token };
  }

  async becomeVendor(userId: number, userRole: string, dto: BecomeVendorDto) {
    if (userRole === 'admin') throw new ForbiddenException('Admins cannot create vendor profiles');

    const existing = await this.vendorRepo.findOne({ where: { user_id: userId }, select: ['id'] });
    if (existing) throw new ConflictException('Already a vendor');

    // Requested plan is recorded but not activated (plan_expires_at stays
    // unset) — no payment is collected on this endpoint, so the admin
    // confirms/adjusts the plan during vendor review.
    let planSlug: string | null = null;
    if (dto.plan_id != null) {
      const plan = await this.planRepo.findOne({ where: { id: dto.plan_id }, select: ['slug'] });
      planSlug = plan?.slug ?? null;
    }

    await this.vendorRepo.save({
      user_id: userId,
      business_name: dto.business_name,
      category: dto.category || dto.business_type || null,
      city: dto.city || null,
      address: dto.address || null,
      phone: dto.phone || null,
      website: dto.website || null,
      gst_number: dto.gst_number || null,
      description: dto.description || null,
      logo_url: dto.logo_url || null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      subscription_plan: planSlug ?? 'starter',
      status: 'pending_review' as any,
    });
    await this.userRepo.update(userId, { role: 'vendor' as any });
    return { message: 'Vendor application submitted for review' };
  }

  async forgotPassword(email: string) {
    const user = await this.userRepo.findOne({
      where: { email: email.trim().toLowerCase(), is_active: true },
      select: ['id'],
    });
    if (!user) return { message: 'If that email exists, a reset link has been sent' };

    await this.passwordResetRepo.update({ user_id: user.id, used_at: IsNull() as any }, { used_at: new Date() });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.passwordResetRepo.save({ user_id: user.id, token, expires_at: expiresAt });

    const appUrl = (this.config.get<string>('appUrl') ?? 'http://localhost:3001').replace(/\/$/, '');
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    const isDev = process.env.APP_ENV !== 'production';
    return {
      message: 'If that email exists, a reset link has been sent',
      ...(isDev && { reset_token: token, reset_url: resetUrl }),
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token || !newPassword || newPassword.length < PASSWORD_MIN_LENGTH || !PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
      throw new BadRequestException(`Token and new password are required. ${PASSWORD_POLICY_MESSAGE}`);
    }
    const reset = await this.passwordResetRepo.findOne({
      where: { token, used_at: IsNull() as any, expires_at: MoreThan(new Date()) },
    });
    if (!reset) throw new BadRequestException('Invalid or expired reset token');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(reset.user_id, {
        password_hash: hash,
        token_invalidated_at: Date.now() as any,
      });
      await manager.getRepository(PasswordReset).update(reset.id, { used_at: new Date() });
    });
    return { message: 'Password reset successful. Please log in again.' };
  }

  async getMe(userId: number) {
    // Web's session-bootstrap check (App.tsx, on every page load now that
    // the JWT itself isn't JS-readable) fully replaces its local user object
    // with this response — it used to selectively merge, but the previous
    // select list here was missing lat/lng/streak_count/login_count, which
    // would have silently wiped those fields out of the UI on every load.
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: [
        'id', 'name', 'email', 'phone', 'city', 'avatar_url', 'role', 'admin_role',
        'email_alerts', 'push_enabled', 'lat', 'lng', 'streak_count', 'login_count',
      ],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: number, dto: { name?: string; phone?: string; city?: string; avatar_url?: string; email_alerts?: boolean; push_enabled?: boolean }) {
    const allowed = ['name', 'phone', 'city', 'avatar_url', 'email_alerts', 'push_enabled'] as const;
    const updateData: Partial<User> = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) (updateData as any)[key] = dto[key];
    }
    if (!Object.keys(updateData).length) return { updated: false };
    await this.userRepo.update(userId, updateData);
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name', 'email', 'phone', 'city', 'avatar_url', 'role', 'email_alerts', 'push_enabled'] as any,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async dailyCheckin(userId: number) {
    // Dates in IST — the audience's local day
    const now = new Date(Date.now() + 5.5 * 3600 * 1000);
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    // coins_enabled previously existed in site_settings and was accepted by
    // the admin UI but read/enforced nowhere in the backend — a toggle that
    // silently did nothing. Streak tracking still runs either way; only the
    // coin payout is gated, so disabling coins doesn't break the check-in habit.
    const coinsSetting = await this.settingRepo.findOne({ where: { key: 'coins_enabled' } });
    const coinsEnabled = coinsSetting?.value !== '0';
    const perDay = coinsEnabled ? 5 : 0;

    // Single atomic statement — the WHERE clause makes concurrent duplicate
    // check-ins a no-op instead of a double award.
    const rows = await this.userRepo.manager.query(
      `UPDATE users
          SET streak_count = CASE WHEN last_checkin = $2::date THEN streak_count + 1 ELSE 1 END,
              coins = coins + LEAST(CASE WHEN last_checkin = $2::date THEN streak_count + 1 ELSE 1 END, 7) * $4,
              last_checkin = $1::date
        WHERE id = $3
          AND (last_checkin IS NULL OR last_checkin < $1::date)
        RETURNING streak_count, coins`,
      [today, yesterday, userId, perDay],
    );
    const updated = rows?.[0]?.[0] ?? rows?.[0]; // driver returns [rows, count]
    if (updated?.streak_count !== undefined) {
      const streak = Number(updated.streak_count);
      return {
        streak,
        coins_awarded: Math.min(streak, 7) * perDay,
        total_coins: Number(updated.coins),
      };
    }

    // Already checked in today (or user missing) — report current state
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'coins', 'streak_count'],
    });
    if (!user) throw new NotFoundException('User not found');
    return { streak: user.streak_count, coins_awarded: 0, total_coins: user.coins };
  }

  async updateLocation(userId: number, lat: number, lng: number, city?: string, accuracy?: number, source = 'gps') {
    await Promise.all([
      this.userLocationRepo.save({ user_id: userId, lat, lng, city: city ?? null, accuracy: accuracy ?? null, source }),
      this.userRepo.update(userId, { lat, lng, ...(city !== undefined && { city }) }),
    ]);
    return { lat, lng, city: city ?? null, accuracy: accuracy ?? null, source };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH || !PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'password_hash'],
    });
    if (!user?.password_hash) {
      throw new BadRequestException('This account uses social login — use forgot-password to set a password');
    }
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.update(userId, {
      password_hash: hash,
      token_invalidated_at: Date.now() as any,
    });
    return { message: 'Password changed successfully. Please log in again.' };
  }

  async logout(userId: number, ctx?: { ip: string; ua: string; requestId?: string }) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['email', 'role'],
    });
    await this.userRepo.update(userId, { token_invalidated_at: Date.now() as any });
    setImmediate(() => this.monitoring.logAuth({
      requestId: ctx?.requestId, userId, email: user?.email, role: user?.role,
      action: 'logout', ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
    }).catch(() => {}));
    return { message: 'Logged out successfully' };
  }

  async requestEmailChange(userId: number, newEmail: string) {
    const email = newEmail?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address');
    }
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'name', 'email'] });
    if (!user) throw new NotFoundException('User not found');
    if (email === user.email.toLowerCase()) {
      throw new BadRequestException('That is already your current email address');
    }
    const taken = await this.userRepo.findOne({ where: { email }, select: ['id'] });
    if (taken) throw new ConflictException('That email address is already in use');

    await this.emailChangeRepo.update(
      { user_id: userId, used_at: IsNull() as any },
      { used_at: new Date(), updated_at: new Date() },
    );

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.emailChangeRepo.save({ user_id: userId, new_email: email, otp, expires_at: expiresAt });

    setImmediate(() => this.mail.sendEmailChangeOtp(email, user.name, otp));

    return { message: `Verification code sent to ${email}` };
  }

  async confirmEmailChange(userId: number, otp: string) {
    if (!otp) throw new BadRequestException('Enter the verification code');
    const request = await this.emailChangeRepo.findOne({
      where: { user_id: userId, otp: String(otp).trim(), used_at: IsNull() as any, expires_at: MoreThan(new Date()) },
      order: { id: 'DESC' },
    });
    if (!request) throw new BadRequestException('Invalid or expired verification code');

    const taken = await this.userRepo.findOne({ where: { email: request.new_email }, select: ['id'] });
    if (taken) throw new ConflictException('That email address is already in use');

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(userId, { email: request.new_email });
      await manager.getRepository(EmailChangeRequest).update(request.id, { used_at: new Date(), updated_at: new Date() });
    });

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name', 'email', 'phone', 'city', 'avatar_url', 'role'],
    });
    return user;
  }

  generateToken(userId: number, role: string): string {
    return this.jwt.sign(
      { sub: userId, user_id: userId, role },
      { expiresIn: this.config.get<number>('jwt.ttl') },
    );
  }

  async generatePowerSyncToken(userId: number): Promise<{ token: string; powersync_url: string }> {
    const secret = this.config.get<string>('powersync.secret');
    const kid = this.config.get<string>('powersync.kid') ?? 'adslife-key-1';
    const powersyncUrl = this.config.get<string>('powersync.url');

    if (!secret || !powersyncUrl) {
      throw new BadRequestException('PowerSync is not configured');
    }

    // Look up the role fresh from the DB rather than trusting the login JWT's
    // (possibly stale, up to 24h old) role claim — a recently-approved vendor
    // or promoted admin must get correct sync access immediately.
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['role'] });

    const secretBuffer = Buffer.from(secret, 'base64');

    const token = jwt.sign(
      { sub: String(userId), role: user?.role ?? 'user' },
      secretBuffer,
      {
        algorithm: 'HS256',
        expiresIn: '1h',
        issuer: powersyncUrl,
        audience: powersyncUrl,
        keyid: kid,
      },
    );

    return { token, powersync_url: powersyncUrl };
  }
}
