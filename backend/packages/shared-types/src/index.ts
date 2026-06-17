export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface AuthResponse {
  accessToken: string;
  user: UserResponse;
}
