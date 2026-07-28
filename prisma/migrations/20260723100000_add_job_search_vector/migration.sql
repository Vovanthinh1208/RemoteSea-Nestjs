-- GET /jobs?q= currently only filters by ILIKE substring match (backed by the
-- pg_trgm indexes from 20260715100000_add_search_trgm_indexes) with no notion
-- of relevance — results within a `q` match are ordered by isFeatured/date,
-- never by how well they match the query. This adds a proper ranking signal.
--
-- "searchVector" is a GENERATED ALWAYS ... STORED column, not a trigger or an
-- application-level sync job: Postgres recomputes it itself on every INSERT/
-- UPDATE, so it can never drift out of sync with title/description the way a
-- trigger or a batch reindex job could. Title is weighted 'A' (highest) and
-- description 'B' so title matches rank above description-only matches.
--
-- Deliberately NOT reflected in schema.prisma: Prisma's schema DSL can't
-- express a generated tsvector column or a GIN index without extra preview
-- features, and nothing here needs the fluent client — job-search.util.ts
-- queries this column exclusively via $queryRaw, the same way the pg_trgm
-- indexes above are also invisible to schema.prisma.
--
-- Plain CREATE INDEX (not CONCURRENTLY), for the same reason as the trgm
-- migration: Prisma runs migrations inside a transaction, where CONCURRENTLY
-- is rejected. Build with CONCURRENTLY by hand instead if the table is large
-- by the time this runs in production.

ALTER TABLE "jobs"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS "jobs_search_vector_idx"
  ON "jobs" USING gin ("searchVector");
