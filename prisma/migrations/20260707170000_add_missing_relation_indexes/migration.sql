-- DropIndex
DROP INDEX "applications_talentId_idx";

-- DropIndex
DROP INDEX "applications_jobId_idx";

-- CreateIndex
CREATE INDEX "applications_talentId_appliedAt_idx" ON "applications"("talentId", "appliedAt");

-- CreateIndex
CREATE INDEX "applications_jobId_appliedAt_idx" ON "applications"("jobId", "appliedAt");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "jobs_status_isFeatured_publishedAt_idx" ON "jobs"("status", "isFeatured", "publishedAt");
