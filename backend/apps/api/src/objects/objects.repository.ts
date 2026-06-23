import { Injectable } from '@nestjs/common';
import { MarketplaceObject, ObjectType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

export type ObjectWithOwnership = MarketplaceObject & {
  ownedSince?: Date;
};

@Injectable()
export class ObjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(objectId: string): Promise<MarketplaceObject | null> {
    return this.prisma.marketplaceObject.findUnique({ where: { objectId } });
  }

  findByIdWithOwners(objectId: string) {
    return this.prisma.marketplaceObject.findUnique({
      where: { objectId },
      include: { owners: { orderBy: { ownedSince: 'asc' } } },
    });
  }

  findOwnedByUser(userId: string): Promise<ObjectWithOwnership[]> {
    return this.prisma.objectOwner.findMany({
      where: { userId },
      include: { object: true },
      orderBy: { ownedSince: 'desc' },
    }).then((records) =>
      records.map((r) => ({
        ...r.object,
        ownedSince: r.ownedSince,
      })),
    );
  }

  findShopItems(): Promise<MarketplaceObject[]> {
    return this.prisma.marketplaceObject.findMany({
      where: {
        type: { in: [ObjectType.PUBLIC, ObjectType.ADMIN] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll(): Promise<MarketplaceObject[]> {
    return this.prisma.marketplaceObject.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  countByType(type: ObjectType): Promise<number> {
    return this.prisma.marketplaceObject.count({ where: { type } });
  }

  countAll(): Promise<number> {
    return this.prisma.marketplaceObject.count();
  }

  hasOwnership(objectId: string, userId: string): Promise<boolean> {
    return this.prisma.objectOwner
      .findUnique({
        where: { objectId_userId: { objectId, userId } },
      })
      .then((record) => !!record);
  }

  createObject(
    data: Prisma.MarketplaceObjectCreateInput,
    ownerUserId: string,
  ): Promise<MarketplaceObject> {
    return this.prisma.$transaction(async (tx) => {
      const object = await tx.marketplaceObject.create({ data });
      await tx.objectOwner.create({
        data: { objectId: object.objectId, userId: ownerUserId },
      });
      return object;
    });
  }

  addOwnership(objectId: string, userId: string): Promise<void> {
    return this.prisma.objectOwner
      .create({
        data: { objectId, userId },
      })
      .then(() => undefined);
  }

  async purchasePublicObject(
    objectId: string,
    buyerId: string,
    creatorId: string,
    cost: number,
  ): Promise<MarketplaceObject> {
    return this.prisma.$transaction(async (tx) => {
      const buyer = await tx.user.findUniqueOrThrow({ where: { id: buyerId } });
      if (buyer.coins < cost) {
        throw new Error('INSUFFICIENT_COINS');
      }

      await tx.user.update({
        where: { id: buyerId },
        data: { coins: buyer.coins - cost },
      });

      const creator = await tx.user.findUniqueOrThrow({
        where: { id: creatorId },
      });
      await tx.user.update({
        where: { id: creatorId },
        data: { coins: creator.coins + cost },
      });

      await tx.objectOwner.create({
        data: { objectId, userId: buyerId },
      });

      return tx.marketplaceObject.findUniqueOrThrow({ where: { objectId } });
    });
  }

  async purchaseAdminObject(
    objectId: string,
    buyerId: string,
    cost: number,
  ): Promise<MarketplaceObject> {
    return this.prisma.$transaction(async (tx) => {
      const buyer = await tx.user.findUniqueOrThrow({ where: { id: buyerId } });
      if (buyer.coins < cost) {
        throw new Error('INSUFFICIENT_COINS');
      }

      await tx.user.update({
        where: { id: buyerId },
        data: { coins: buyer.coins - cost },
      });

      await tx.objectOwner.create({
        data: { objectId, userId: buyerId },
      });

      return tx.marketplaceObject.findUniqueOrThrow({ where: { objectId } });
    });
  }
}
