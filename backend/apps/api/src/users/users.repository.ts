import { Injectable } from '@nestjs/common';
import { Prisma, User, UserState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { ADMIN_CREATOR_ID, MAX_ACTIVE_USERS } from '@marketplace/shared-types';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { id: { not: ADMIN_CREATOR_ID } },
      orderBy: [{ state: 'asc' }, { activatedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findAllIds(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { id: { not: ADMIN_CREATOR_ID } },
      orderBy: [
        { state: 'asc' },
        { activatedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        state: true,
        activatedAt: true,
        createdAt: true,
        coins: true,
      },
    }) as Promise<User[]>;
  }

  countByState(state: UserState): Promise<number> {
    return this.prisma.user.count({
      where: { state, id: { not: ADMIN_CREATOR_ID } },
    });
  }

  findOldestActive(excludeUserId?: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        state: UserState.ACTIVE,
        id: excludeUserId ? { not: excludeUserId } : undefined,
      },
      orderBy: { activatedAt: 'asc' },
    });
  }

  countActive(): Promise<number> {
    return this.countByState(UserState.ACTIVE);
  }

  countPregenerated(): Promise<number> {
    return this.countByState(UserState.PREGENERATED);
  }

  async getAllExistingIds(): Promise<Set<string>> {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    return new Set(users.map((u) => u.id));
  }

  createUser(id: string, state: UserState = UserState.PREGENERATED): Promise<User> {
    return this.prisma.user.create({
      data: { id, state, coins: 10 },
    });
  }

  activateUser(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { state: UserState.ACTIVE, activatedAt: new Date() },
    });
  }

  markRemoved(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { state: UserState.REMOVED, activatedAt: null },
    });
  }

  updateCoins(id: string, coins: number): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { coins },
    });
  }

  async deductCoins(id: string, amount: number): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      if (user.coins < amount) {
        throw new Error('INSUFFICIENT_COINS');
      }
      return tx.user.update({
        where: { id },
        data: { coins: user.coins - amount },
      });
    });
  }

  async hasSufficientCoins(id: string, amount: number): Promise<boolean> {
    const user = await this.findById(id);
    if (!user) {
      return false;
    }
    return user.coins >= amount;
  }

  async addCoins(id: string, amount: number): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      return tx.user.update({
        where: { id },
        data: { coins: user.coins + amount },
      });
    });
  }

  async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  ensureSystemCreator(): Promise<User> {
    return this.prisma.user.upsert({
      where: { id: ADMIN_CREATOR_ID },
      update: {},
      create: {
        id: ADMIN_CREATOR_ID,
        state: UserState.REMOVED,
        coins: 0,
      },
    });
  }

  countNonSystemUsers(): Promise<number> {
    return this.prisma.user.count({
      where: { id: { not: ADMIN_CREATOR_ID } },
    });
  }
}

export { MAX_ACTIVE_USERS };
