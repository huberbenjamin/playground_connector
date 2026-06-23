import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ActorRole,
  JwtAdminPayload,
  JwtPayload,
  JwtUserPayload,
} from '@marketplace/shared-types';
import { AuthenticatedActor } from '../common/types';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  issueUserToken(userId: string): string {
    const payload: JwtUserPayload = {
      sub: userId,
      role: ActorRole.USER,
    };
    return this.jwtService.sign(payload);
  }

  issueAdminToken(username: string): string {
    const payload: JwtAdminPayload = {
      sub: `admin:${username}`,
      role: ActorRole.ADMIN,
      username,
    };
    return this.jwtService.sign(payload);
  }

  validateAdminCredentials(username: string, password: string): boolean {
    const admins = [
      {
        username: this.configService.get<string>('ADMIN_1_USERNAME', ''),
        password: this.configService.get<string>('ADMIN_1_PASSWORD', ''),
      },
      {
        username: this.configService.get<string>('ADMIN_2_USERNAME', ''),
        password: this.configService.get<string>('ADMIN_2_PASSWORD', ''),
      },
    ];

    return admins.some(
      (admin) => admin.username === username && admin.password === password,
    );
  }

  payloadToActor(payload: JwtPayload): AuthenticatedActor {
    if (payload.role === ActorRole.ADMIN) {
      return {
        adminId: payload.sub,
        username: payload.username,
        role: ActorRole.ADMIN,
      };
    }

    return {
      userId: payload.sub,
      role: ActorRole.USER,
    };
  }
}
