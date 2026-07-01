-- AlterTable
ALTER TABLE "User" ADD COLUMN "activeSessionId" UUID,
ADD COLUMN "sessionExpiresAt" TIMESTAMP(3);
