-- CreateEnum
CREATE TYPE "ProfileHighlightType" AS ENUM ('PORTFOLIO', 'EDUCATION', 'LANGUAGE');

-- AlterTable
ALTER TABLE "talent_profiles" ADD COLUMN     "noticePeriod" TEXT;

-- CreateTable
CREATE TABLE "profile_highlights" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "type" "ProfileHighlightType" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "tag" TEXT,
    "url" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_highlights_talentId_type_idx" ON "profile_highlights"("talentId", "type");

-- AddForeignKey
ALTER TABLE "profile_highlights" ADD CONSTRAINT "profile_highlights_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

