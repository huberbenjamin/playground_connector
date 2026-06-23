import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActorRole } from '@marketplace/shared-types';
import { AuthenticatedActor } from '../../common/types';
import { JWT_STRATEGY_NAME } from '../../common/types';

@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {
  handleRequest<T = AuthenticatedActor>(
    err: Error | null,
    user: T | false,
  ): T {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Authentication required');
    }
    return user;
  }
}

@Injectable()
export class UserAuthGuard extends JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<T = AuthenticatedActor>(
    err: Error | null,
    user: T | false,
  ): T {
    const actor = super.handleRequest(err, user) as AuthenticatedActor;
    if (actor.role !== ActorRole.USER) {
      throw new UnauthorizedException('User authentication required');
    }
    return actor as T;
  }
}

@Injectable()
export class AdminAuthGuard extends JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<T = AuthenticatedActor>(
    err: Error | null,
    user: T | false,
  ): T {
    const actor = super.handleRequest(err, user) as AuthenticatedActor;
    if (actor.role !== ActorRole.ADMIN) {
      throw new UnauthorizedException('Admin authentication required');
    }
    return actor as T;
  }
}
