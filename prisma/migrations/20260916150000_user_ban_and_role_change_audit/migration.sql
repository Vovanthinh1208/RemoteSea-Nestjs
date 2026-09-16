-- AlterTable
ALTER TABLE "users" ADD COLUMN "bannedAt" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'USER_BANNED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'USER_UNBANNED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'USER_ROLE_CHANGED';

-- AlterEnum
ALTER TYPE "AdminAuditTargetType" ADD VALUE 'USER';
