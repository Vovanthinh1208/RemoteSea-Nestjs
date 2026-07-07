-- CreateIndex
CREATE INDEX "jobs_planPaid_paidAt_idx" ON "jobs"("planPaid", "paidAt");

-- CreateIndex
CREATE INDEX "employer_profiles_isVerified_idx" ON "employer_profiles"("isVerified");

-- CreateIndex
CREATE INDEX "job_alerts_isActive_idx" ON "job_alerts"("isActive");
