-- CreateEnum
CREATE TYPE "CompanyMemberRole" AS ENUM ('OWNER', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER');

-- CreateEnum
CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN "interviewerId" TEXT;

-- CreateTable
CREATE TABLE "company_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "role" "CompanyMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "CompanyMemberRole" NOT NULL,
    "token" TEXT NOT NULL,
    "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interviews_interviewerId_idx" ON "interviews"("interviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "company_members_userId_key" ON "company_members"("userId");

-- CreateIndex
CREATE INDEX "company_members_employerId_role_idx" ON "company_members"("employerId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_token_key" ON "team_invitations"("token");

-- CreateIndex
CREATE INDEX "team_invitations_employerId_status_createdAt_idx" ON "team_invitations"("employerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "team_invitations_email_status_idx" ON "team_invitations"("email", "status");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing EmployerProfile's creator becomes that company's
-- OWNER via an explicit CompanyMember row — from this migration forward,
-- authorization reads CompanyMember exclusively (see CompanyOwnershipGuardBase),
-- so the original creator needs a real seat, not just the legacy
-- EmployerProfile.userId column, to keep working. gen_random_uuid() (built
-- into Postgres 13+, no extension needed) stands in for Prisma's app-side
-- cuid() here since this is raw SQL — the id column has no format
-- constraint, so a mixed-format id is harmless.
INSERT INTO "company_members" ("id", "userId", "employerId", "role", "createdAt")
SELECT gen_random_uuid()::text, "userId", "id", 'OWNER', "createdAt"
FROM "employer_profiles";
