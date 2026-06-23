import { Injectable } from '@nestjs/common';
import { ObjectType } from '@prisma/client';
import { ADMIN_CREATOR_ID } from '@marketplace/shared-types';
import { PrismaService } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class UserCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async removeUser(userId: string): Promise<void> {
    if (userId === ADMIN_CREATOR_ID) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const ownedObjectIds = await tx.objectOwner.findMany({
        where: { userId },
        select: { objectId: true },
      });

      const createdObjects = await tx.marketplaceObject.findMany({
        where: { creatorUserId: userId },
        select: { objectId: true, type: true, sogPath: true, thumbnailPath: true },
      });

      const affectedObjectIds = new Set<string>([
        ...ownedObjectIds.map((o) => o.objectId),
        ...createdObjects.map((o) => o.objectId),
      ]);

      await tx.objectOwner.deleteMany({ where: { userId } });

      for (const objectId of affectedObjectIds) {
        const object = await tx.marketplaceObject.findUnique({
          where: { objectId },
          include: {
            owners: { orderBy: { ownedSince: 'asc' } },
          },
        });

        if (!object) {
          continue;
        }

        if (object.type === ObjectType.ADMIN) {
          continue;
        }

        if (object.owners.length > 0) {
          const newCreatorId = object.owners[0].userId;
          await tx.marketplaceObject.update({
            where: { objectId },
            data: { creatorUserId: newCreatorId },
          });
        } else {
          await tx.marketplaceObject.delete({ where: { objectId } });
          await this.storageService.deleteObjectFiles(
            object.sogPath,
            object.thumbnailPath,
          );
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: { state: 'REMOVED', activatedAt: null },
      });
    });
  }
}
