-- job_categories' primary key is (jobId, categoryId), in that order — it
-- doesn't serve a lookup by categoryId alone efficiently. SalaryRepository's
-- salary-benchmarks query walks Category -> jobs (via job_categories filtered
-- by categoryId), which needed exactly this index.

CREATE INDEX IF NOT EXISTS "job_categories_categoryId_idx"
  ON "job_categories" ("categoryId");
