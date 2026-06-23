import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { User, UserState } from '@prisma/client';
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

    if (user.state === UserState.PREGENERATED) {
      const activeCount = await this.usersRepository.countActive();
      if (activeCount >= 10) {
        await this.userPoolService.evictOldestActiveIfNeeded(userId);
      }
      return this.usersRepository.activateUser(userId);
    }

    return user;
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
