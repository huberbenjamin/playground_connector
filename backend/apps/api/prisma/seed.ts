import { PrismaClient, UserState } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_CREATOR_ID = '000000';
const INITIAL_POOL_SIZE = 10;

function generateSixDigitId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function generateUniqueUserId(existingIds: Set<string>): Promise<string> {
  let id: string;
  do {
    id = generateSixDigitId();
  } while (existingIds.has(id) || id === SYSTEM_CREATOR_ID);
  existingIds.add(id);
  return id;
}

async function ensureSystemCreator(): Promise<void> {
  await prisma.user.upsert({
    where: { id: SYSTEM_CREATOR_ID },
    update: {},
    create: {
      id: SYSTEM_CREATOR_ID,
      state: UserState.REMOVED,
      coins: 0,
    },
  });
}

async function ensureUserPool(): Promise<void> {
  const existingUsers = await prisma.user.findMany({
    where: { id: { not: SYSTEM_CREATOR_ID } },
    select: { id: true },
  });

  const existingIds = new Set(existingUsers.map((u) => u.id));
  const pregeneratedCount = await prisma.user.count({
    where: { state: UserState.PREGENERATED },
  });

  const targetPregenerated = Math.max(0, INITIAL_POOL_SIZE - (existingUsers.length - pregeneratedCount));

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

async function main(): Promise<void> {
  await ensureSystemCreator();
  await ensureUserPool();
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
