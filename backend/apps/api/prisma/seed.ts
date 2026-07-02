import { PrismaClient, ObjectType, UserState } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ADMIN_CREATOR_ID, SEED_ADMIN_OBJECT_IDS } from '@marketplace/shared-types';

const prisma = new PrismaClient();

const INITIAL_POOL_SIZE = 10;

type SeedAdminObject = {
  objectId: string;
  assetDir: string;
  title: string;
  description: string;
  sogSource: string;
  thumbnailSource: string;
  sogFileName: string;
  thumbnailFileName: string;
};

const SEED_ADMIN_OBJECTS: SeedAdminObject[] = [
  {
    objectId: SEED_ADMIN_OBJECT_IDS[0],
    assetDir: 'cat-rabbit',
    title: 'Cat Rabbit',
    description: 'Admin shop item — cat rabbit splat.',
    sogSource: 'cat-rabbit.sog',
    thumbnailSource: 'cat-rabbit.jpg',
    sogFileName: 'cat-rabbit.sog',
    thumbnailFileName: 'cat-rabbit.jpg',
  },
  {
    objectId: SEED_ADMIN_OBJECT_IDS[1],
    assetDir: 'ml-sharp-knight',
    title: 'Knight',
    description: 'Admin shop item — ML Sharp knight splat.',
    sogSource: 'knight.sog',
    thumbnailSource: 'knight.jpg',
    sogFileName: 'knight.sog',
    thumbnailFileName: 'knight.jpg',
  },
  {
    objectId: SEED_ADMIN_OBJECT_IDS[2],
    assetDir: 'baby',
    title: 'Baby',
    description: 'Admin shop item — baby splat.',
    sogSource: 'baby.sog',
    thumbnailSource: 'baby.jpg',
    sogFileName: 'baby.sog',
    thumbnailFileName: 'baby.jpg',
  },
];

const API_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(API_ROOT, '../..');
const SEED_ASSETS_ROOT = path.join(API_ROOT, 'prisma/seed-assets');

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
  assetDir: string,
  sourceName: string,
  targetDir: string,
  targetName: string,
): Promise<string> {
  const sourcePath = path.join(SEED_ASSETS_ROOT, assetDir, sourceName);
  await fs.access(sourcePath);

  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, targetName);
  await fs.copyFile(sourcePath, targetPath);

  return targetName;
}

async function ensureAdminObject(seedObject: SeedAdminObject): Promise<void> {
  const storageRoot = resolveStorageRoot();
  const sogDir = path.join(storageRoot, 'sog');
  const thumbnailDir = path.join(storageRoot, 'thumbnails');

  const sogFileName = await copySeedAsset(
    seedObject.assetDir,
    seedObject.sogSource,
    sogDir,
    seedObject.sogFileName,
  );
  const thumbnailFileName = await copySeedAsset(
    seedObject.assetDir,
    seedObject.thumbnailSource,
    thumbnailDir,
    seedObject.thumbnailFileName,
  );

  const sogPath = path.join('sog', sogFileName);
  const thumbnailPath = path.join('thumbnails', thumbnailFileName);

  await prisma.marketplaceObject.upsert({
    where: { objectId: seedObject.objectId },
    update: {
      title: seedObject.title,
      description: seedObject.description,
      sogPath,
      thumbnailPath,
      type: ObjectType.ADMIN,
      creatorUserId: ADMIN_CREATOR_ID,
    },
    create: {
      objectId: seedObject.objectId,
      title: seedObject.title,
      description: seedObject.description,
      sogPath,
      thumbnailPath,
      type: ObjectType.ADMIN,
      creatorUserId: ADMIN_CREATOR_ID,
    },
  });

  await prisma.objectOwner.upsert({
    where: {
      objectId_userId: {
        objectId: seedObject.objectId,
        userId: ADMIN_CREATOR_ID,
      },
    },
    update: {},
    create: {
      objectId: seedObject.objectId,
      userId: ADMIN_CREATOR_ID,
    },
  });
}

async function ensureAdminShopObjects(): Promise<void> {
  for (const seedObject of SEED_ADMIN_OBJECTS) {
    await ensureAdminObject(seedObject);
    console.log(`Admin shop object seeded: ${seedObject.title} (${seedObject.objectId})`);
  }
}

async function main(): Promise<void> {
  await ensureSystemCreator();
  await ensureUserPool();
  await ensureAdminShopObjects();
  console.log('Database seed completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
