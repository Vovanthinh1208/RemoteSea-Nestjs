-- PB64 Multi-round interview scorecards support
-- 1. Add column "round" with default 1 (so all existing scorecards belong to Round 1)
-- 2. Add column "roundName" optional (e.g. "Vòng 1 - Kỹ thuật")
-- 3. Drop old unique constraint on (authorId, applicationId)
-- 4. Create new unique constraint on (authorId, applicationId, round)
-- 5. Add index on (applicationId, round)

ALTER TABLE "interview_scorecards"
  ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "roundName" TEXT;

DROP INDEX IF EXISTS "interview_scorecards_authorId_applicationId_key";

CREATE UNIQUE INDEX "interview_scorecards_authorId_applicationId_round_key"
  ON "interview_scorecards"("authorId", "applicationId", "round");

CREATE INDEX "interview_scorecards_applicationId_round_idx"
  ON "interview_scorecards"("applicationId", "round");
