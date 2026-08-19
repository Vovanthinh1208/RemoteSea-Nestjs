-- CreateTable
CREATE TABLE "profile_views" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "viewDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_views_talentId_createdAt_idx" ON "profile_views"("talentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "profile_views_viewerId_talentId_viewDate_key" ON "profile_views"("viewerId", "talentId", "viewDate");

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
