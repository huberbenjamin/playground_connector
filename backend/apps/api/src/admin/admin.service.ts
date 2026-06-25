import { Injectable } from '@nestjs/common';
import { ObjectType } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { ObjectsRepository } from '../objects/objects.repository';
import { ObjectsService } from '../objects/objects.service';
import {
  AdminObjectResponseDto,
  AdminStatsResponseDto,
  AdminUserIdResponseDto,
  AdminUserResponseDto,
} from './dto/admin.dto';
import { ObjectResponseDto } from '../objects/dto/objects.dto';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly objectsRepository: ObjectsRepository,
    private readonly objectsService: ObjectsService,
    private readonly storageService: StorageService,
  ) {}

  async getUserIds(): Promise<AdminUserIdResponseDto[]> {
    const users = await this.usersService.getAllUserIds();
    return users.map((user) => ({
      userId: user.id,
      state: user.state,
      activatedAt: user.activatedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    }));
  }

  async getUsers(): Promise<AdminUserResponseDto[]> {
    const users = await this.usersService.getAllUsers();
    return users.map((user) => ({
      userId: user.id,
      state: user.state,
      coins: user.coins,
      activatedAt: user.activatedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    }));
  }

  async getObjects(): Promise<AdminObjectResponseDto[]> {
    const objects = await this.objectsRepository.findAll();
    return objects.map((object) => ({
      objectId: object.objectId,
      title: object.title,
      description: object.description,
      creatorUserId: object.creatorUserId,
      sogUrl: this.storageService.toPublicUrl(object.sogPath),
      thumbnailUrl: this.storageService.toPublicUrl(object.thumbnailPath),
      type: object.type,
      createdAt: object.createdAt.toISOString(),
    }));
  }

  async addCoins(userId: string, amount: number) {
    const user = await this.usersService.addCoins(userId, amount);
    return {
      userId: user.id,
      coins: user.coins,
    };
  }

  async createAdminObject(
    title: string,
    description: string,
    sogFile: Express.Multer.File,
    thumbnailFile: Express.Multer.File,
  ): Promise<ObjectResponseDto> {
    return this.objectsService.createAdminObject(
      title,
      description,
      sogFile,
      thumbnailFile,
    );
  }

  async getStats(): Promise<AdminStatsResponseDto> {
    const [userStats, totalObjects, publicObjects, exclusiveObjects, adminObjects] =
      await Promise.all([
        this.usersService.getStats(),
        this.objectsRepository.countAll(),
        this.objectsRepository.countByType(ObjectType.PUBLIC),
        this.objectsRepository.countByType(ObjectType.EXCLUSIVE),
        this.objectsRepository.countByType(ObjectType.ADMIN),
      ]);

    return {
      ...userStats,
      totalObjects,
      publicObjects,
      exclusiveObjects,
      adminObjects,
    };
  }
}
