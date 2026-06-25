import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObjectType } from '@prisma/client';
import { SHOP_PURCHASE_COST } from '@marketplace/shared-types';
import { ObjectsRepository } from '../objects/objects.repository';
import { ShopItemResponseDto } from './dto/shop.dto';
import { ObjectResponseDto } from '../objects/dto/objects.dto';
import { ObjectsService } from '../objects/objects.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ShopService {
  constructor(
    private readonly objectsRepository: ObjectsRepository,
    private readonly objectsService: ObjectsService,
    private readonly storageService: StorageService,
  ) {}

  async getShopItems(): Promise<ShopItemResponseDto[]> {
    const items = await this.objectsRepository.findShopItems();
    return items.map((item) => ({
      objectId: item.objectId,
      title: item.title,
      description: item.description,
      creatorUserId: item.creatorUserId,
      thumbnailUrl: this.storageService.toPublicUrl(item.thumbnailPath),
      type: item.type,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async purchase(objectId: string, buyerId: string): Promise<ObjectResponseDto> {
    const object = await this.objectsRepository.findById(objectId);
    if (!object) {
      throw new NotFoundException('Object not found in shop');
    }

    if (object.type !== ObjectType.PUBLIC && object.type !== ObjectType.ADMIN) {
      throw new NotFoundException('Object not available in shop');
    }

    const alreadyOwns = await this.objectsRepository.hasOwnership(
      objectId,
      buyerId,
    );
    if (alreadyOwns) {
      throw new ConflictException('You already own this object');
    }

    try {
      if (object.type === ObjectType.PUBLIC) {
        const purchased = await this.objectsRepository.purchasePublicObject(
          objectId,
          buyerId,
          object.creatorUserId,
          SHOP_PURCHASE_COST,
        );
        return this.objectsService.toResponse(purchased);
      }

      const purchased = await this.objectsRepository.purchaseAdminObject(
        objectId,
        buyerId,
        SHOP_PURCHASE_COST,
      );
      return this.objectsService.toResponse(purchased);
    } catch (error) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
        throw new BadRequestException('Insufficient coins');
      }
      throw error;
    }
  }
}
