-- CreateEnum
CREATE TYPE "JobModerationRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "job_moderation_flags" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "riskLevel" "JobModerationRiskLevel" NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_moderation_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_moderation_flags_jobId_key" ON "job_moderation_flags"("jobId");

-- AddForeignKey
ALTER TABLE "job_moderation_flags" ADD CONSTRAINT "job_moderation_flags_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
