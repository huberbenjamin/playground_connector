import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@marketplace/shared-types';
import { AuthService } from './auth.service';
import { AuthenticatedActor } from '../common/types';
import { JWT_STRATEGY_NAME } from '../common/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedActor {
    if (!payload?.role || !payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    return this.authService.payloadToActor(payload);
  }
}
