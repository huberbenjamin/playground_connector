import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedActor } from '../types';

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedActor => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedActor }>();
    return request.user;
  },
);

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedActor }>();
    return request.user.role === 'USER' ? request.user.userId : '';
  },
);
