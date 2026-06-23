export enum UserState {
  PREGENERATED = 'PREGENERATED',
  ACTIVE = 'ACTIVE',
  REMOVED = 'REMOVED',
}

export enum ObjectType {
  PUBLIC = 'PUBLIC',
  EXCLUSIVE = 'EXCLUSIVE',
  ADMIN = 'ADMIN',
}

export enum ActorRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface JwtUserPayload {
  sub: string;
  role: ActorRole.USER;
}

export interface JwtAdminPayload {
  sub: string;
  role: ActorRole.ADMIN;
  username: string;
}

export type JwtPayload = JwtUserPayload | JwtAdminPayload;

export interface LoginResponse {
  accessToken: string;
}

export interface UserMeResponse {
  userId: string;
  state: UserState;
  coins: number;
  activatedAt: string | null;
}

export interface CoinsResponse {
  coins: number;
}

export interface ObjectResponse {
  objectId: string;
  title: string;
  description: string;
  creatorUserId: string;
  sogPath: string;
  thumbnailPath: string;
  type: ObjectType;
  createdAt: string;
  ownedSince?: string;
}

export interface ShopItemResponse {
  objectId: string;
  title: string;
  description: string;
  creatorUserId: string;
  thumbnailPath: string;
  type: ObjectType;
  createdAt: string;
}

export interface AdminUserIdResponse {
  userId: string;
  state: UserState;
  activatedAt: string | null;
  createdAt: string;
}

export interface AdminUserResponse {
  userId: string;
  state: UserState;
  coins: number;
  activatedAt: string | null;
  createdAt: string;
}

export interface AdminStatsResponse {
  activeUsers: number;
  removedUsers: number;
  pregeneratedUsers: number;
  totalObjects: number;
  publicObjects: number;
  exclusiveObjects: number;
  adminObjects: number;
}

export interface GiftObjectRequest {
  recipientUserId: string;
}

export interface AddCoinsRequest {
  amount: number;
}

export interface GenerateSogResponse {
  sogFile: string | null;
}

export const ADMIN_CREATOR_ID = '000000';
export const USER_ID_PATTERN = /^\d{6}$/;
export const MAX_ACTIVE_USERS = 10;
export const INITIAL_USER_COINS = 10;
export const EXCLUSIVE_OBJECT_COST = 5;
export const PUBLIC_OBJECT_COST = 2;
export const SHOP_PURCHASE_COST = 1;
