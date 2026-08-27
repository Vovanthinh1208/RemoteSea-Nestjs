-- GET /jobs?type=... and ?level=... (buildJobWhere) filter on jobType/level
-- alongside the status condition every search already applies — an { in }
-- filter on a low-cardinality enum, same shape as the country/salaryMax
-- indexes added in 20260723090000_add_job_country_salary_indexes. Neither
-- combination was covered by an existing index. Not measured against a
-- production query plan (no slow-query log data available when this was
-- added) — reasoned from that same precedent, not a guess from nothing;
-- revisit/drop if PrismaService's slow-query logging never actually shows
-- these filters as the bottleneck.

CREATE INDEX IF NOT EXISTS "jobs_status_jobType_idx"
  ON "jobs" ("status", "jobType");

CREATE INDEX IF NOT EXISTS "jobs_status_level_idx"
  ON "jobs" ("status", "level");
