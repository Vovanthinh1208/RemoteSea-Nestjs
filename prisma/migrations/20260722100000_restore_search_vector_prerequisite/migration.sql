-- The historical 20260723085837_y migration drops a search vector that was
-- never created in the checked-in history. Supply its missing prerequisite
-- without changing any previously applied migration/checksum. On existing
-- installations the later search-vector migration already supplied both
-- objects, so this is a no-op. No business data is removed.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS "jobs_search_vector_idx"
  ON "jobs" USING gin ("searchVector");
