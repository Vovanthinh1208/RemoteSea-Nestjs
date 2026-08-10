-- CreateEnum
CREATE TYPE "TalentVisibility" AS ENUM ('PUBLIC', 'VERIFIED_EMPLOYERS');

-- AlterTable
ALTER TABLE "talent_profiles" ADD COLUMN     "visibility" "TalentVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currencyDisplay" TEXT NOT NULL DEFAULT 'USD ($)',
ADD COLUMN     "isPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'English',
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'Vietnam';

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationUpdates" BOOLEAN NOT NULL DEFAULT true,
    "employerMessages" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
    "instantMatchAlerts" BOOLEAN NOT NULL DEFAULT true,
    "productNews" BOOLEAN NOT NULL DEFAULT false,
    "tipsAndResources" BOOLEAN NOT NULL DEFAULT true,
    "browserPush" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

