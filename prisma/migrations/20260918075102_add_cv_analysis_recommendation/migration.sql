-- CreateEnum
CREATE TYPE "CvRecommendation" AS ENUM ('ADVANCE', 'HOLD', 'REJECT');

-- AlterTable
ALTER TABLE "cv_analyses" ADD COLUMN     "recommendation" "CvRecommendation",
ADD COLUMN     "recommendationReason" TEXT;
