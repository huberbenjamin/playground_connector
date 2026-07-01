import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { User, UserState } from '@prisma/client';
import { ADMIN_CREATOR_ID } from '@marketplace/shared-types';
import { UsersRepository } from './users.repository';
import { UserPoolService } from './user-pool.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly userPoolService: UserPoolService,
  ) {}

  async login(userId: string): Promise<User> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid user ID');
    }

    if (user.state === UserState.REMOVED) {
      throw new UnauthorizedException('User has been removed');
    }

    if (this.usersRepository.hasActiveSession(user)) {
      throw new UnauthorizedException('User is already logged in');
    }

    if (user.state === UserState.PREGENERATED) {
      const activeCount = await this.usersRepository.countActive();
      if (activeCount >= 10) {
        await this.userPoolService.evictOldestActiveIfNeeded(userId);
      }
      return this.usersRepository.activateUser(userId);
    }

    return user;
  }

  async startSession(userId: string, sessionExpiresAt: Date): Promise<string> {
    return this.usersRepository.startSession(userId, sessionExpiresAt);
  }

  async endSession(userId: string, sessionId: string): Promise<void> {
    await this.usersRepository.endSession(userId, sessionId);
  }

  async getMe(userId: string): Promise<User> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.state !== UserState.ACTIVE) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getCoins(userId: string): Promise<number> {
    const user = await this.getMe(userId);
    return user.coins;
  }

  async removeUserByAdmin(
    userId: string,
  ): Promise<{ removedUserId: string; newUserId: string }> {
    if (userId === ADMIN_CREATOR_ID) {
      throw new BadRequestException('Cannot remove the system user');
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.state === UserState.REMOVED) {
      throw new BadRequestException('User is already removed');
    }

    const newUserId =
      await this.userPoolService.removeUserAndReplenishPool(userId);

    return { removedUserId: userId, newUserId };
  }

  async addCoins(userId: string, amount: number): Promise<User> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const user = await this.usersRepository.findById(userId);
    if (!user || user.state === UserState.REMOVED) {
      throw new NotFoundException('User not found');
    }

    return this.usersRepository.addCoins(userId, amount);
  }

  async getAllUsers(): Promise<User[]> {
    return this.usersRepository.findAll();
  }

  async getAllUserIds(): Promise<User[]> {
    return this.usersRepository.findAllIds();
  }

  async getStats(): Promise<{
    activeUsers: number;
    removedUsers: number;
    pregeneratedUsers: number;
  }> {
    const [activeUsers, removedUsers, pregeneratedUsers] = await Promise.all([
      this.usersRepository.countActive(),
      this.usersRepository.countByState(UserState.REMOVED),
      this.usersRepository.countPregenerated(),
    ]);

    return { activeUsers, removedUsers, pregeneratedUsers };
  }
}
