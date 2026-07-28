-- GET /jobs?country=... and the timezone-bucket filters (job-search.util.ts)
-- filter on country alongside the status condition every search already
-- applies; GET /jobs?sort=salary orders by salaryMax alongside the same
-- status condition. Neither combination was covered by an existing index —
-- both previously forced a re-check/sort over every row already matching
-- status instead of using an index to narrow or order directly.

CREATE INDEX IF NOT EXISTS "jobs_status_country_idx"
  ON "jobs" ("status", "country");

CREATE INDEX IF NOT EXISTS "jobs_status_salaryMax_idx"
  ON "jobs" ("status", "salaryMax");
