-- CreateEnum
CREATE TYPE "EmployerVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "employer_profiles" ADD COLUMN     "verificationEmail" TEXT,
ADD COLUMN     "verificationStatus" "EmployerVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED';

-- CreateTable
CREATE TABLE "employer_email_verifications" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employer_email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employer_email_verifications_token_key" ON "employer_email_verifications"("token");

-- CreateIndex
CREATE INDEX "employer_email_verifications_employerId_createdAt_idx" ON "employer_email_verifications"("employerId", "createdAt");

-- AddForeignKey
ALTER TABLE "employer_email_verifications" ADD CONSTRAINT "employer_email_verifications_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

