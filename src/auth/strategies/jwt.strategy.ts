import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly db: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret'),
    });
  }

  async validate(payload: any) {
    if (!payload?.user_id) throw new UnauthorizedException();

    const [user] = await this.db.query(
      'SELECT is_active, token_invalidated_at FROM users WHERE id = ?',
      [payload.user_id],
    );

    if (!user || !user.is_active) {
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
