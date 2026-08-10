-- AlterTable
ALTER TABLE "talent_profiles" ADD COLUMN     "employmentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "primaryRole" TEXT,
ADD COLUMN     "rightToWork" TEXT,
ADD COLUMN     "timezoneOverlap" TEXT[] DEFAULT ARRAY[]::TEXT[];

