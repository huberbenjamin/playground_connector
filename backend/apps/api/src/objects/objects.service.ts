import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ObjectType } from '@prisma/client';
import {
  ADMIN_CREATOR_ID,
  EXCLUSIVE_OBJECT_COST,
  PUBLIC_OBJECT_COST,
} from '@marketplace/shared-types';
import { ObjectsRepository } from './objects.repository';
import { StorageService } from '../storage/storage.service';
import { PythonGeneratorService } from '../python-generator/python-generator.service';
import { UsersRepository } from '../users/users.repository';
import { ObjectResponseDto, UserListingType } from './dto/objects.dto';

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
      sogUrl: this.storageService.toPublicUrl(object.sogPath),
      thumbnailUrl: this.storageService.toPublicUrl(object.thumbnailPath),
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
    return this.generateObjectFromImages(
      userId,
      title,
      description,
      images,
      UserListingType.EXCLUSIVE,
    );
  }

  async createPublicObject(
    userId: string,
    title: string,
    description: string,
    images: Express.Multer.File[],
  ): Promise<ObjectResponseDto> {
    return this.generateObjectFromImages(
      userId,
      title,
      description,
      images,
      UserListingType.PUBLIC,
    );
  }

  async generateObjectFromImages(
    userId: string,
    title: string,
    description: string,
    images: Express.Multer.File[],
    listingType: UserListingType,
  ): Promise<ObjectResponseDto> {
    this.validateUploadImages(images);

    const objectType = this.toObjectType(listingType);
    const cost = this.getCreationCost(listingType);

    const hasCoins = await this.usersRepository.hasSufficientCoins(userId, cost);
    if (!hasCoins) {
      throw new BadRequestException(
        `Insufficient coins. This operation requires ${cost} coins.`,
      );
    }

    let sogBuffer: Buffer;
    try {
      sogBuffer = await this.pythonGeneratorService.generateSog(images);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SOG generation failed';
      throw new ServiceUnavailableException(message);
    }

    await this.chargeUser(userId, cost);

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
        type: objectType,
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

  private validateUploadImages(images: Express.Multer.File[]): void {
    if (!images || images.length < 1 || images.length > 6) {
      throw new BadRequestException('Between 1 and 6 images are required');
    }

    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]);

    for (const image of images) {
      const mimeType = image.mimetype.toLowerCase();
      const extension = image.originalname.toLowerCase();
      const isAllowed =
        allowedMimeTypes.has(mimeType) ||
        extension.endsWith('.jpg') ||
        extension.endsWith('.jpeg') ||
        extension.endsWith('.png') ||
        extension.endsWith('.webp');

      if (!isAllowed) {
        throw new BadRequestException(
          'Only image files are allowed (.jpg, .jpeg, .png, .webp)',
        );
      }
    }
  }

  private getCreationCost(listingType: UserListingType): number {
    return listingType === UserListingType.EXCLUSIVE
      ? EXCLUSIVE_OBJECT_COST
      : PUBLIC_OBJECT_COST;
  }

  private toObjectType(listingType: UserListingType): ObjectType {
    return listingType === UserListingType.EXCLUSIVE
      ? ObjectType.EXCLUSIVE
      : ObjectType.PUBLIC;
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
