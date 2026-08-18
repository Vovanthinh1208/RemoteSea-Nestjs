-- CreateEnum
CREATE TYPE "TalentVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "talent_profiles" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationEmail" TEXT,
ADD COLUMN     "verificationStatus" "TalentVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "talent_email_verifications" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "talent_email_verifications_token_key" ON "talent_email_verifications"("token");

-- CreateIndex
CREATE INDEX "talent_email_verifications_talentId_createdAt_idx" ON "talent_email_verifications"("talentId", "createdAt");

-- AddForeignKey
ALTER TABLE "talent_email_verifications" ADD CONSTRAINT "talent_email_verifications_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

