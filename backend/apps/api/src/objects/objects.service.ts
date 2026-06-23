import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObjectType } from '@prisma/client';
import {
  ADMIN_CREATOR_ID,
  EXCLUSIVE_OBJECT_COST,
  PUBLIC_OBJECT_COST,
  SHOP_PURCHASE_COST,
} from '@marketplace/shared-types';
import { ObjectsRepository } from './objects.repository';
import { StorageService } from '../storage/storage.service';
import { PythonGeneratorService } from '../python-generator/python-generator.service';
import { UsersRepository } from '../users/users.repository';
import { ObjectResponseDto } from './dto/objects.dto';

@Injectable()
export class ObjectsService {
  constructor(
    private readonly objectsRepository: ObjectsRepository,
    private readonly storageService: StorageService,
    private readonly pythonGeneratorService: PythonGeneratorService,
    private readonly usersRepository: UsersRepository,
  ) {}

  toResponse(
    object: {
      objectId: string;
      title: string;
      description: string;
      creatorUserId: string;
      sogPath: string;
      thumbnailPath: string;
      type: ObjectType;
      createdAt: Date;
      ownedSince?: Date;
    },
  ): ObjectResponseDto {
    return {
      objectId: object.objectId,
      title: object.title,
      description: object.description,
      creatorUserId: object.creatorUserId,
      sogPath: object.sogPath,
      thumbnailPath: object.thumbnailPath,
      type: object.type,
      createdAt: object.createdAt.toISOString(),
      ownedSince: object.ownedSince?.toISOString(),
    };
  }

  async getOwnedObjects(userId: string): Promise<ObjectResponseDto[]> {
    const objects = await this.objectsRepository.findOwnedByUser(userId);
    return objects.map((o) => this.toResponse(o));
  }

  async getObject(objectId: string, userId: string): Promise<ObjectResponseDto> {
    const owns = await this.objectsRepository.hasOwnership(objectId, userId);
    if (!owns) {
      const object = await this.objectsRepository.findById(objectId);
      if (!object || object.type === ObjectType.EXCLUSIVE) {
        throw new NotFoundException('Object not found');
      }
      if (object.type === ObjectType.PUBLIC || object.type === ObjectType.ADMIN) {
        return this.toResponse(object);
      }
      throw new ForbiddenException('You do not own this object');
    }

    const owned = await this.objectsRepository.findOwnedByUser(userId);
    const object = owned.find((o) => o.objectId === objectId);
    if (!object) {
      throw new NotFoundException('Object not found');
    }
    return this.toResponse(object);
  }

  async createExclusiveObject(
    userId: string,
    title: string,
    description: string,
    images: Express.Multer.File[],
  ): Promise<ObjectResponseDto> {
    this.validateImages(images);
    await this.chargeUser(userId, EXCLUSIVE_OBJECT_COST);

    const sogBuffer = await this.pythonGeneratorService.generateSog(images);
    const sogFile = await this.storageService.saveSog(sogBuffer);
    const thumbnail = await this.storageService.saveThumbnail(
      images[0].buffer,
      images[0].originalname,
    );

    const object = await this.objectsRepository.createObject(
      {
        title,
        description,
        creator: { connect: { id: userId } },
        sogPath: sogFile.relativePath,
        thumbnailPath: thumbnail.relativePath,
        type: ObjectType.EXCLUSIVE,
      },
      userId,
    );

    return this.toResponse(object);
  }

  async createPublicObject(
    userId: string,
    title: string,
    description: string,
    images: Express.Multer.File[],
  ): Promise<ObjectResponseDto> {
    this.validateImages(images);
    await this.chargeUser(userId, PUBLIC_OBJECT_COST);

    const sogBuffer = await this.pythonGeneratorService.generateSog(images);
    const sogFile = await this.storageService.saveSog(sogBuffer);
    const thumbnail = await this.storageService.saveThumbnail(
      images[0].buffer,
      images[0].originalname,
    );

    const object = await this.objectsRepository.createObject(
      {
        title,
        description,
        creator: { connect: { id: userId } },
        sogPath: sogFile.relativePath,
        thumbnailPath: thumbnail.relativePath,
        type: ObjectType.PUBLIC,
      },
      userId,
    );

    return this.toResponse(object);
  }

  async createAdminObject(
    title: string,
    description: string,
    sogFile: Express.Multer.File,
    thumbnailFile: Express.Multer.File,
  ): Promise<ObjectResponseDto> {
    const storedSog = await this.storageService.saveSog(
      sogFile.buffer,
      this.getSogExtension(sogFile.originalname),
    );
    const storedThumbnail = await this.storageService.saveThumbnail(
      thumbnailFile.buffer,
      thumbnailFile.originalname,
    );

    const object = await this.objectsRepository.createObject(
      {
        title,
        description,
        creator: { connect: { id: ADMIN_CREATOR_ID } },
        sogPath: storedSog.relativePath,
        thumbnailPath: storedThumbnail.relativePath,
        type: ObjectType.ADMIN,
      },
      ADMIN_CREATOR_ID,
    );

    return this.toResponse(object);
  }

  async giftObject(
    objectId: string,
    senderUserId: string,
    recipientUserId: string,
  ): Promise<ObjectResponseDto> {
    const senderOwns = await this.objectsRepository.hasOwnership(
      objectId,
      senderUserId,
    );
    if (!senderOwns) {
      throw new ForbiddenException('You do not own this object');
    }

    const recipient = await this.usersRepository.findById(recipientUserId);
    if (!recipient || recipient.state === 'REMOVED') {
      throw new NotFoundException('Recipient not found');
    }

    const recipientOwns = await this.objectsRepository.hasOwnership(
      objectId,
      recipientUserId,
    );
    if (recipientOwns) {
      const object = await this.objectsRepository.findById(objectId);
      return this.toResponse(object!);
    }

    await this.objectsRepository.addOwnership(objectId, recipientUserId);
    const object = await this.objectsRepository.findById(objectId);
    return this.toResponse(object!);
  }

  private validateImages(images: Express.Multer.File[]): void {
    if (!images || images.length < 4 || images.length > 6) {
      throw new BadRequestException('Between 4 and 6 images are required');
    }
  }

  private async chargeUser(userId: string, amount: number): Promise<void> {
    try {
      await this.usersRepository.deductCoins(userId, amount);
    } catch {
      throw new BadRequestException('Insufficient coins');
    }
  }

  private getSogExtension(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.sog')) {
      return '.sog';
    }
    return '.sog';
  }
}
