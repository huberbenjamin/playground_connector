-- CreateEnum
CREATE TYPE "UserState" AS ENUM ('PREGENERATED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "ObjectType" AS ENUM ('PUBLIC', 'EXCLUSIVE', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" VARCHAR(6) NOT NULL,
    "state" "UserState" NOT NULL DEFAULT 'PREGENERATED',
    "coins" INTEGER NOT NULL DEFAULT 10,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objects" (
    "objectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "creatorUserId" VARCHAR(6) NOT NULL,
    "sogPath" TEXT NOT NULL,
    "thumbnailPath" TEXT NOT NULL,
    "type" "ObjectType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objects_pkey" PRIMARY KEY ("objectId")
);

-- CreateTable
CREATE TABLE "object_owners" (
    "objectId" UUID NOT NULL,
    "userId" VARCHAR(6) NOT NULL,
    "ownedSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "object_owners_pkey" PRIMARY KEY ("objectId","userId")
);

-- CreateIndex
CREATE INDEX "User_state_activatedAt_idx" ON "User"("state", "activatedAt");

-- CreateIndex
CREATE INDEX "objects_type_idx" ON "objects"("type");

-- CreateIndex
CREATE INDEX "objects_creatorUserId_idx" ON "objects"("creatorUserId");

-- CreateIndex
CREATE INDEX "object_owners_userId_idx" ON "object_owners"("userId");

-- CreateIndex
CREATE INDEX "object_owners_objectId_ownedSince_idx" ON "object_owners"("objectId", "ownedSince");

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "object_owners" ADD CONSTRAINT "object_owners_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "objects"("objectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "object_owners" ADD CONSTRAINT "object_owners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
