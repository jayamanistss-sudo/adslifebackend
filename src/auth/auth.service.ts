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
import axios from 'axios';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { BecomeVendorDto } from './dto/google-auth.dto';
import { ReferralService } from '../referral/referral.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private db: DataSource,
    private jwt: JwtService,
    private config: ConfigService,
    private referral: ReferralService,
  ) {}

  async login(dto: LoginDto) {
    const [user] = await this.db.query(
      'SELECT id, name, email, password_hash, role, city, lat, lng, avatar_url FROM users WHERE email = ? AND is_active = 1',
      [dto.email.trim()],
    );
    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.db.query(
      'UPDATE users SET last_login = CURDATE(), login_count = login_count + 1 WHERE id = ?',
      [user.id],
    );

    const token = this.generateToken(user.id, user.role);
    delete user.password_hash;
    return { user, token };
  }

  async register(dto: RegisterDto) {
    if (!dto.name || !dto.email || !dto.password) {
      throw new BadRequestException('Name, email and password are required');
    }

    const [existing] = await this.db.query('SELECT id FROM users WHERE email = ?', [dto.email]);
    if (existing) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 10);
    const role = ['user', 'vendor'].includes(dto.role || '') ? dto.role! : 'user';

    const result = await this.db.query(
      'INSERT INTO users (name, email, phone, password_hash, city, role) VALUES (?, ?, ?, ?, ?, ?)',
      [dto.name.trim(), dto.email.trim(), dto.phone?.trim() || null, hash, dto.city?.trim() || null, role],
    );
    const userId = result.insertId;

    await this.db.query(
      'INSERT IGNORE INTO user_preferences (user_id, preferred_categories, preferred_vendors) VALUES (?, ?, ?)',
      [userId, '[]', '[]'],
    );

    // Generate referral code for new user
    await this.referral.ensureCode(userId);

    // Award coins if referred
    if (dto.ref) {
      await this.referral.applyReferral(userId, dto.ref.toUpperCase());
    }

    const token = this.generateToken(userId, role);
    return {
      user: { id: userId, name: dto.name, email: dto.email, role },
      token,
    };
  }

  async googleAuth(accessToken: string) {
    const { data: profile } = await axios.get(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`,
    );

    if (!profile?.email) throw new BadRequestException('Invalid Google token');

    const [existing] = await this.db.query(
      'SELECT id, name, email, role, avatar_url FROM users WHERE email = ?',
      [profile.email],
    );

    let userId: number;
    let role = 'user';

    if (existing) {
      userId = existing.id;
      role = existing.role;
      await this.db.query(
        'UPDATE users SET last_login = CURDATE(), login_count = login_count + 1, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
        [profile.picture || null, userId],
      );
    } else {
      const result = await this.db.query(
        'INSERT INTO users (name, email, avatar_url, role, google_id) VALUES (?, ?, ?, "user", ?)',
        [profile.name || profile.email, profile.email, profile.picture || null, profile.sub || null],
      );
      userId = result.insertId;
      await this.db.query(
        'INSERT IGNORE INTO user_preferences (user_id, preferred_categories, preferred_vendors) VALUES (?, ?, ?)',
        [userId, '[]', '[]'],
      );
    }

    const token = this.generateToken(userId, role);

    const [user] = await this.db.query(
      'SELECT id, name, email, role, avatar_url FROM users WHERE id = ?',
      [userId],
    );
    return { user, token };
  }

  async becomeVendor(userId: number, dto: BecomeVendorDto) {
    const [existing] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [userId]);
    if (existing) throw new ConflictException('Already a vendor');

    await this.db.query(
      'INSERT INTO vendors (user_id, business_name, category, city, phone, status) VALUES (?, ?, ?, ?, ?, "pending_review")',
      [userId, dto.business_name, dto.category || null, dto.city || null, dto.phone || null],
    );
    await this.db.query('UPDATE users SET role = "vendor" WHERE id = ?', [userId]);

    return { message: 'Vendor application submitted for review' };
  }

  generateToken(userId: number, role: string): string {
    return this.jwt.sign(
      { sub: userId, user_id: userId, role },
      { expiresIn: this.config.get<number>('jwt.ttl') },
    );
  }
}
