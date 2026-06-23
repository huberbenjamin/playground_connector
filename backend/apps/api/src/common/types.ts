import { ActorRole } from '@marketplace/shared-types';

export const JWT_STRATEGY_NAME = 'jwt';

export interface AuthenticatedUser {
  userId: string;
  role: ActorRole.USER;
}

export interface AuthenticatedAdmin {
  adminId: string;
  username: string;
  role: ActorRole.ADMIN;
}

export type AuthenticatedActor = AuthenticatedUser | AuthenticatedAdmin;

export function isAdmin(actor: AuthenticatedActor): actor is AuthenticatedAdmin {
  return actor.role === ActorRole.ADMIN;
}

export function isUser(actor: AuthenticatedActor): actor is AuthenticatedUser {
  return actor.role === ActorRole.USER;
}
