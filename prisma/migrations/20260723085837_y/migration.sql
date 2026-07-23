/*
  Warnings:

  - You are about to drop the column `searchVector` on the `jobs` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "jobs_description_trgm_idx";

-- DropIndex
DROP INDEX "jobs_search_vector_idx";

-- DropIndex
DROP INDEX "jobs_title_trgm_idx";

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "searchVector";
