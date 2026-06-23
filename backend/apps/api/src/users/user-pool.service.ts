import { Injectable } from '@nestjs/common';
import { UserState } from '@prisma/client';
import { ADMIN_CREATOR_ID, MAX_ACTIVE_USERS } from '@marketplace/shared-types';
import { UsersRepository } from './users.repository';
import { UserCleanupService } from './user-cleanup.service';

@Injectable()
export class UserPoolService {
  private readonly initialPoolSize = 10;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly userCleanupService: UserCleanupService,
  ) {}

  async ensureInitialPool(): Promise<void> {
    await this.usersRepository.ensureSystemCreator();

    const totalNonSystem = await this.usersRepository.countNonSystemUsers();
    if (totalNonSystem >= this.initialPoolSize) {
      return;
    }

    const existingIds = await this.usersRepository.getAllExistingIds();
    const toCreate = this.initialPoolSize - totalNonSystem;

    for (let i = 0; i < toCreate; i++) {
      const id = await this.generateUniqueUserId(existingIds);
      await this.usersRepository.createUser(id, UserState.PREGENERATED);
    }
  }

  async generateNewPregeneratedUser(): Promise<string> {
    const existingIds = await this.usersRepository.getAllExistingIds();
    const id = await this.generateUniqueUserId(existingIds);
    await this.usersRepository.createUser(id, UserState.PREGENERATED);
    return id;
  }

  async evictOldestActiveIfNeeded(excludeUserId?: string): Promise<void> {
    let activeCount = await this.usersRepository.countActive();

    while (activeCount >= MAX_ACTIVE_USERS) {
      const oldest = await this.usersRepository.findOldestActive(excludeUserId);
      if (!oldest) {
        break;
      }

      await this.userCleanupService.removeUser(oldest.id);
      await this.generateNewPregeneratedUser();
      activeCount = await this.usersRepository.countActive();
    }
  }

  private async generateUniqueUserId(existingIds: Set<string>): Promise<string> {
    let id: string;
    do {
      id = Math.floor(100000 + Math.random() * 900000).toString();
    } while (existingIds.has(id) || id === ADMIN_CREATOR_ID);
    existingIds.add(id);
    return id;
  }
}
