import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. httpOnly cookie (web browser clients — XSS-safe)
        (req: any) => req?.cookies?.adslife_token ?? null,
        // 2. Authorization: Bearer header (mobile apps, Postman, server-to-server)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret'),
    });
  }

  async validate(payload: any) {
    if (!payload?.user_id) throw new UnauthorizedException();

    const user = await this.userRepo.findOne({
      where: { id: payload.user_id },
      select: ['id', 'is_active', 'token_invalidated_at'],
    });

    if (!user?.is_active) {
      throw new UnauthorizedException('Account is inactive or banned');
    }

    // Reject tokens issued before logout / password change
    if (user.token_invalidated_at && payload.iat * 1000 < +user.token_invalidated_at) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    return {
      user_id: payload.user_id,
      sub:     payload.sub,
      role:    payload.role,
      iat:     payload.iat,
      exp:     payload.exp,
    };
  }
}
