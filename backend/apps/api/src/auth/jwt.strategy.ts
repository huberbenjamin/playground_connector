import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ActorRole, JwtPayload } from '@marketplace/shared-types';
import { AuthService } from './auth.service';
import { AuthenticatedActor } from '../common/types';
import { JWT_STRATEGY_NAME } from '../common/types';
import { UsersRepository } from '../users/users.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedActor> {
    if (!payload?.role || !payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.role === ActorRole.USER) {
      if (!payload.sessionId) {
        throw new UnauthorizedException('Invalid token');
      }

      const sessionValid = await this.usersRepository.isSessionValid(
        payload.sub,
        payload.sessionId,
      );
      if (!sessionValid) {
        throw new UnauthorizedException('Session expired or invalid');
      }
    }

    return this.authService.payloadToActor(payload);
  }
}
