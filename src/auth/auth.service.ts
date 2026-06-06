import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { BecomeVendorDto } from './dto/google-auth.dto';
import { ReferralService } from '../referral/referral.service';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly referral: ReferralService,
    private readonly monitoring: MonitoringService,
  ) {}

  async login(dto: LoginDto, ctx?: { ip: string; ua: string; requestId?: string }) {
    const [user] = await this.db.query(
      'SELECT id, name, email, password_hash, role, city, lat, lng, avatar_url FROM users WHERE email = $1 AND is_active = true',
      [dto.email.trim()],
    );
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
    await this.db.query(
      'UPDATE users SET last_login = CURRENT_DATE, login_count = login_count + 1 WHERE id = $1',
      [user.id],
    );
    setImmediate(() => this.monitoring.logAuth({
      requestId: ctx?.requestId, userId: user.id, email: user.email,
      role: user.role, action: 'login_success',
      ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
    }).catch(() => {}));
    const token = this.generateToken(user.id, user.role);
    delete user.password_hash;
    return { user, token };
  }

  async register(dto: RegisterDto, ctx?: { ip: string; ua: string; requestId?: string }) {
    if (!dto.name || !dto.email || !dto.password) {
      throw new BadRequestException('Name, email and password are required');
    }
    const [existing] = await this.db.query('SELECT id FROM users WHERE email = $1', [dto.email]);
    if (existing) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 10);
    const role = 'user';

    const userId: number = await this.db.transaction(async (manager) => {
      const result = await manager.query(
        'INSERT INTO users (name, email, phone, password_hash, city, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [dto.name.trim(), dto.email.trim(), dto.phone?.trim() || null, hash, dto.city?.trim() || null, role],
      );
      const newId: number = result[0].id;
      await manager.query(
        'INSERT INTO user_preferences (user_id, preferred_categories, preferred_vendors) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [newId, '[]', '[]'],
      );
      return newId;
    });

    await this.referral.ensureCode(userId);
    if (dto.ref) await this.referral.applyReferral(userId, dto.ref.toUpperCase());

    setImmediate(() => this.monitoring.logAuth({
      requestId: ctx?.requestId, userId, email: dto.email, role,
      action: 'register', ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
    }).catch(() => {}));

    const token = this.generateToken(userId, role);
    return { user: { id: userId, name: dto.name, email: dto.email, role }, token };
  }

  async googleAuth(accessToken: string) {
    const { data: profile } = await axios.get(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!profile?.email) throw new BadRequestException('Invalid Google token');

    // Verify token audience matches this app's client ID
    const clientId = this.config.get<string>('googleClientId');
    if (clientId && profile.aud && profile.aud !== clientId) {
      throw new UnauthorizedException('Google token was not issued for this application');
    }

    const [existing] = await this.db.query(
      'SELECT id, name, email, role, avatar_url FROM users WHERE email = $1',
      [profile.email],
    );

    let userId: number;
    let role = 'user';

    if (existing) {
      userId = existing.id;
      role = existing.role;
      await this.db.query(
        'UPDATE users SET last_login = CURRENT_DATE, login_count = login_count + 1, avatar_url = COALESCE(avatar_url, $1) WHERE id = $2',
        [profile.picture || null, userId],
      );
    } else {
      const result = await this.db.query(
        'INSERT INTO users (name, email, avatar_url, role, google_id) VALUES ($1, $2, $3, \'user\', $4) RETURNING id',
        [profile.name || profile.email, profile.email, profile.picture || null, profile.sub || null],
      );
      userId = result[0].id;
      await this.db.query(
        'INSERT INTO user_preferences (user_id, preferred_categories, preferred_vendors) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, '[]', '[]'],
      );
    }

    const token = this.generateToken(userId, role);
    const [user] = await this.db.query(
      'SELECT id, name, email, role, avatar_url FROM users WHERE id = $1',
      [userId],
    );
    return { user, token };
  }

  async becomeVendor(userId: number, userRole: string, dto: BecomeVendorDto) {
    if (userRole === 'admin') throw new ForbiddenException('Admins cannot create vendor profiles');

    const [existing] = await this.db.query('SELECT id FROM vendors WHERE user_id = $1', [userId]);
    if (existing) throw new ConflictException('Already a vendor');

    await this.db.query(
      'INSERT INTO vendors (user_id, business_name, category, city, phone, status) VALUES ($1, $2, $3, $4, $5, \'pending_review\')',
      [userId, dto.business_name, dto.category || null, dto.city || null, dto.phone || null],
    );
    await this.db.query('UPDATE users SET role = \'vendor\' WHERE id = $1', [userId]);
    return { message: 'Vendor application submitted for review' };
  }

  async forgotPassword(email: string) {
    const [user] = await this.db.query(
      'SELECT id FROM users WHERE email = $1 AND is_active = true',
      [email.trim().toLowerCase()],
    );
    // Always return success to prevent email enumeration
    if (!user) return { message: 'If that email exists, a reset link has been sent' };

    // Invalidate any previous unused tokens
    await this.db.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id],
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.db.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt],
    );

    const appUrl = (this.config.get<string>('appUrl') ?? 'http://localhost:3001').replace(/\/$/, '');
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    // TODO: send reset email via nodemailer when SMTP is configured

    const isDev = process.env.APP_ENV !== 'production';
    return {
      message: 'If that email exists, a reset link has been sent',
      ...(isDev && { reset_token: token, reset_url: resetUrl }),
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token || !newPassword || newPassword.length < 6) {
      throw new BadRequestException('Token and new password (min 6 chars) are required');
    }
    const [reset] = await this.db.query(
      'SELECT * FROM password_resets WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()',
      [token],
    );
    if (!reset) throw new BadRequestException('Invalid or expired reset token');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.transaction(async (manager) => {
      await manager.query(
        'UPDATE users SET password_hash = $1, token_invalidated_at = $2 WHERE id = $3',
        [hash, Date.now(), reset.user_id],
      );
      await manager.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);
    });
    return { message: 'Password reset successful. Please log in again.' };
  }

  async updateProfile(userId: number, dto: { name?: string; phone?: string; city?: string; avatar_url?: string }) {
    const allowed = ['name', 'phone', 'city', 'avatar_url'] as const;
    const fields: string[] = [];
    const values: any[] = [];
    for (const key of allowed) {
      if (dto[key] !== undefined) { fields.push(`${key} = $${values.length + 1}`); values.push(dto[key]); }
    }
    if (!fields.length) return { updated: false };
    values.push(userId);
    await this.db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
    const [user] = await this.db.query(
      'SELECT id, name, email, phone, city, avatar_url, role FROM users WHERE id = $1',
      [userId],
    );
    return user;
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }
    const [user] = await this.db.query('SELECT id, password_hash FROM users WHERE id = $1', [userId]);
    if (!user?.password_hash) {
      throw new BadRequestException('This account uses social login — use forgot-password to set a password');
    }
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.query(
      'UPDATE users SET password_hash = $1, token_invalidated_at = $2 WHERE id = $3',
      [hash, Date.now(), userId],
    );
    return { message: 'Password changed successfully. Please log in again.' };
  }

  async logout(userId: number, ctx?: { ip: string; ua: string; requestId?: string }) {
    const [user] = await this.db.query('SELECT email, role FROM users WHERE id = $1', [userId]);
    await this.db.query('UPDATE users SET token_invalidated_at = $1 WHERE id = $2', [Date.now(), userId]);
    setImmediate(() => this.monitoring.logAuth({
      requestId: ctx?.requestId, userId, email: user?.email, role: user?.role,
      action: 'logout', ipAddress: ctx?.ip ?? '0.0.0.0', userAgent: ctx?.ua,
    }).catch(() => {}));
    return { message: 'Logged out successfully' };
  }

  generateToken(userId: number, role: string): string {
    return this.jwt.sign(
      { sub: userId, user_id: userId, role },
      { expiresIn: this.config.get<number>('jwt.ttl') },
    );
  }

  generatePowerSyncToken(userId: number): { token: string; powersync_url: string } {
    const secret = this.config.get<string>('powersync.secret');
    const kid = this.config.get<string>('powersync.kid') ?? 'adslife-key-1';
    const powersyncUrl = this.config.get<string>('powersync.url');

    if (!secret || !powersyncUrl) {
      throw new BadRequestException('PowerSync is not configured');
    }

    const secretBuffer = Buffer.from(secret, 'base64');

    const token = jwt.sign(
      { sub: String(userId) },
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
