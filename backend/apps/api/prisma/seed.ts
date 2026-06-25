import { PrismaClient, ObjectType, UserState } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ADMIN_CREATOR_ID,
  SEED_DEFAULT_ADMIN_OBJECT_ID,
} from '@marketplace/shared-types';

const prisma = new PrismaClient();

const INITIAL_POOL_SIZE = 10;
const DEFAULT_ADMIN_OBJECT = {
  objectId: SEED_DEFAULT_ADMIN_OBJECT_ID,
  title: 'Object 01',
  description: 'Default admin catalog item seeded for the marketplace shop.',
  sogFileName: 'object01.sog',
  thumbnailFileName: 'object01.jpg',
};

const API_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(API_ROOT, '../..');
const SEED_ASSET_DIR = path.join(API_ROOT, 'prisma/seed-assets/object01');

function resolveStorageRoot(): string {
  const configured = process.env.STORAGE_ROOT;
  if (!configured) {
    return path.join(BACKEND_ROOT, 'storage');
  }
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(API_ROOT, configured);
}

function generateSixDigitId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function generateUniqueUserId(existingIds: Set<string>): Promise<string> {
  let id: string;
  do {
    id = generateSixDigitId();
  } while (existingIds.has(id) || id === ADMIN_CREATOR_ID);
  existingIds.add(id);
  return id;
}

async function ensureSystemCreator(): Promise<void> {
  await prisma.user.upsert({
    where: { id: ADMIN_CREATOR_ID },
    update: {},
    create: {
      id: ADMIN_CREATOR_ID,
      state: UserState.REMOVED,
      coins: 0,
    },
  });
}

async function ensureUserPool(): Promise<void> {
  const existingUsers = await prisma.user.findMany({
    where: { id: { not: ADMIN_CREATOR_ID } },
    select: { id: true },
  });

  const existingIds = new Set(existingUsers.map((u) => u.id));
  const pregeneratedCount = await prisma.user.count({
    where: { state: UserState.PREGENERATED },
  });

  const targetPregenerated = Math.max(
    0,
    INITIAL_POOL_SIZE - (existingUsers.length - pregeneratedCount),
  );

  const toCreate = INITIAL_POOL_SIZE - existingUsers.length;
  if (toCreate > 0) {
    for (let i = 0; i < toCreate; i++) {
      const id = await generateUniqueUserId(existingIds);
      await prisma.user.create({
        data: {
          id,
          state: UserState.PREGENERATED,
          coins: 10,
        },
      });
    }
  } else if (pregeneratedCount < targetPregenerated) {
    const needed = targetPregenerated - pregeneratedCount;
    for (let i = 0; i < needed; i++) {
      const id = await generateUniqueUserId(existingIds);
      await prisma.user.create({
        data: {
          id,
          state: UserState.PREGENERATED,
          coins: 10,
        },
      });
    }
  }
}

async function copySeedAsset(
  sourceName: string,
  targetDir: string,
  targetName: string,
): Promise<string> {
  const sourcePath = path.join(SEED_ASSET_DIR, sourceName);
  await fs.access(sourcePath);

  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, targetName);
  await fs.copyFile(sourcePath, targetPath);

  return targetName;
}

async function ensureDefaultAdminObject(): Promise<void> {
  const storageRoot = resolveStorageRoot();
  const sogDir = path.join(storageRoot, 'sog');
  const thumbnailDir = path.join(storageRoot, 'thumbnails');

  const sogFileName = await copySeedAsset(
    'object.sog',
    sogDir,
    DEFAULT_ADMIN_OBJECT.sogFileName,
  );
  const thumbnailFileName = await copySeedAsset(
    'thumbnail.jpg',
    thumbnailDir,
    DEFAULT_ADMIN_OBJECT.thumbnailFileName,
  );

  const sogPath = path.join('sog', sogFileName);
  const thumbnailPath = path.join('thumbnails', thumbnailFileName);

  await prisma.marketplaceObject.upsert({
    where: { objectId: DEFAULT_ADMIN_OBJECT.objectId },
    update: {
      title: DEFAULT_ADMIN_OBJECT.title,
      description: DEFAULT_ADMIN_OBJECT.description,
      sogPath,
      thumbnailPath,
      type: ObjectType.ADMIN,
      creatorUserId: ADMIN_CREATOR_ID,
    },
    create: {
      objectId: DEFAULT_ADMIN_OBJECT.objectId,
      title: DEFAULT_ADMIN_OBJECT.title,
      description: DEFAULT_ADMIN_OBJECT.description,
      sogPath,
      thumbnailPath,
      type: ObjectType.ADMIN,
      creatorUserId: ADMIN_CREATOR_ID,
    },
  });

  await prisma.objectOwner.upsert({
    where: {
      objectId_userId: {
        objectId: DEFAULT_ADMIN_OBJECT.objectId,
        userId: ADMIN_CREATOR_ID,
      },
    },
    update: {},
    create: {
      objectId: DEFAULT_ADMIN_OBJECT.objectId,
      userId: ADMIN_CREATOR_ID,
    },
  });
}

async function main(): Promise<void> {
  await ensureSystemCreator();
  await ensureUserPool();
  await ensureDefaultAdminObject();
  console.log('Database seed completed.');
  console.log(
    `Default admin shop object seeded: ${DEFAULT_ADMIN_OBJECT.objectId}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
