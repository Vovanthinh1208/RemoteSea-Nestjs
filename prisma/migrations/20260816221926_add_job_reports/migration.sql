-- CreateEnum
CREATE TYPE "JobReportReason" AS ENUM ('SCAM', 'MISLEADING', 'ALREADY_FILLED', 'DISCRIMINATORY', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "JobReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "job_reports" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "JobReportReason" NOT NULL,
    "details" TEXT,
    "status" "JobReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_reports_status_createdAt_idx" ON "job_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "job_reports_jobId_idx" ON "job_reports"("jobId");

-- AddForeignKey
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

