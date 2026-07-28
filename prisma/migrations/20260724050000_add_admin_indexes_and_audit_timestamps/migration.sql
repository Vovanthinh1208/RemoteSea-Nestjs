-- Composite indexes replacing single-column ones that only covered half of
-- an existing filter+sort query (see schema.prisma comments on each): the
-- admin moderation queue (status + createdAt asc), the employer job-list
-- dashboard (employerId + createdAt desc), and the admin employer list
-- (isVerified + createdAt desc).

-- DropIndex
DROP INDEX "jobs_employerId_idx";

-- DropIndex
DROP INDEX "employer_profiles_isVerified_idx";

-- CreateIndex
CREATE INDEX "jobs_employerId_createdAt_idx" ON "jobs"("employerId", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_status_createdAt_idx" ON "jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "employer_profiles_isVerified_createdAt_idx" ON "employer_profiles"("isVerified", "createdAt");

-- AlterTable: audit timestamps not derivable from updatedAt (a later,
-- unrelated edit moves updatedAt without touching these events) — see
-- schema.prisma comments.
ALTER TABLE "jobs" ADD COLUMN "rejectedAt" TIMESTAMP(3);

ALTER TABLE "employer_profiles" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "employer_profiles" ADD COLUMN "suspendedAt" TIMESTAMP(3);
