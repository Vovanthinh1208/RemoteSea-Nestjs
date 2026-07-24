-- Replaces single-column indexes with composites that match the actual
-- query shapes (filter + sort together), so Postgres can satisfy each query
-- from the index alone instead of filtering then sorting separately. See
-- alerts.repository.ts (findByUser, findActiveAlerts) and
-- saved.repository.ts (findAllForUser).

-- DropIndex
DROP INDEX "job_alerts_userId_idx";

-- DropIndex
DROP INDEX "job_alerts_isActive_idx";

-- CreateIndex
CREATE INDEX "job_alerts_userId_createdAt_idx" ON "job_alerts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "job_alerts_isActive_lastSentAt_idx" ON "job_alerts"("isActive", "lastSentAt");

-- DropIndex
DROP INDEX "saved_jobs_userId_idx";

-- CreateIndex
CREATE INDEX "saved_jobs_userId_createdAt_idx" ON "saved_jobs"("userId", "createdAt");
