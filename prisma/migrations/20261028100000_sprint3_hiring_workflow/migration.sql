-- Sprint 3 (PB53–PB73) hiring workflow. Additive only: new nullable columns,
-- enum values renamed in place, and one enum remapped row-by-row. No data is
-- dropped.

-- PB66 AC3: CvRecommendation ADVANCE/HOLD/REJECT -> PROCEED/REVIEW/REJECT.
ALTER TYPE "CvRecommendation" RENAME VALUE 'ADVANCE' TO 'PROCEED';
ALTER TYPE "CvRecommendation" RENAME VALUE 'HOLD' TO 'REVIEW';

-- PB73: in-app event for a new application (employer side).
ALTER TYPE "NotificationType" ADD VALUE 'APPLICATION_RECEIVED';

-- PB64 AC4: five-point recommendation scale (adds NEUTRAL). Existing rows are
-- mapped STRONG_YES->STRONGLY_RECOMMEND, YES->RECOMMEND, NO->NOT_RECOMMEND,
-- STRONG_NO->STRONGLY_NOT_RECOMMEND.
CREATE TYPE "ScorecardRecommendation_new" AS ENUM (
  'STRONGLY_RECOMMEND',
  'RECOMMEND',
  'NEUTRAL',
  'NOT_RECOMMEND',
  'STRONGLY_NOT_RECOMMEND'
);
ALTER TABLE "interview_scorecards"
  ALTER COLUMN "recommendation" TYPE "ScorecardRecommendation_new"
  USING (
    CASE "recommendation"::text
      WHEN 'STRONG_YES' THEN 'STRONGLY_RECOMMEND'
      WHEN 'YES' THEN 'RECOMMEND'
      WHEN 'NO' THEN 'NOT_RECOMMEND'
      WHEN 'STRONG_NO' THEN 'STRONGLY_NOT_RECOMMEND'
    END
  )::"ScorecardRecommendation_new";
DROP TYPE "ScorecardRecommendation";
ALTER TYPE "ScorecardRecommendation_new" RENAME TO "ScorecardRecommendation";

-- PB64 AC2–3: per-criterion ratings and written feedback.
ALTER TABLE "interview_scorecards"
  ADD COLUMN "technicalRating" INTEGER,
  ADD COLUMN "communicationRating" INTEGER,
  ADD COLUMN "cultureFitRating" INTEGER,
  ADD COLUMN "strengths" TEXT,
  ADD COLUMN "improvements" TEXT;

-- PB53 AC2 (contact phone), PB56 (offer details + decline reason),
-- PB58 BR2 (rejection feedback for the talent).
ALTER TABLE "applications"
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "offerSalary" TEXT,
  ADD COLUMN "offerBenefits" TEXT,
  ADD COLUMN "offerStartDate" TIMESTAMP(3),
  ADD COLUMN "offerDeclineReason" TEXT;

-- PB60 AC2 (title, platform) and PB62 (cancellation reason).
ALTER TABLE "interviews"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "platform" TEXT,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- PB71 AC3: review title.
ALTER TABLE "reviews" ADD COLUMN "title" TEXT;
