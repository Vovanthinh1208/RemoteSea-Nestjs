-- GET /jobs?q= and the alert-cron keyword filter both match with
-- `ILIKE '%term%'` (Prisma `contains, mode: insensitive`) on jobs.title and
-- jobs.description. A leading-wildcard ILIKE can't use a btree index, so every
-- search request sequentially scans all ACTIVE jobs, pattern-matching the
-- largest text column in the table. pg_trgm GIN indexes make Postgres serve
-- those exact same ILIKE queries from a trigram index — no application code
-- change needed.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because Prisma runs migrations inside
-- a transaction, where CONCURRENTLY is not allowed. This briefly write-locks
-- the jobs table while each index builds; if the table is large by the time
-- this runs in production, build them manually with CONCURRENTLY instead and
-- mark this migration as applied.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "jobs_title_trgm_idx"
  ON "jobs" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "jobs_description_trgm_idx"
  ON "jobs" USING gin ("description" gin_trgm_ops);
