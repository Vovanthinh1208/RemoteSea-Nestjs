-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('EMPLOYER_VERIFIED', 'EMPLOYER_SUSPENDED', 'JOB_APPROVED', 'JOB_REJECTED', 'JOB_REPORT_RESOLVED', 'JOB_REPORT_DISMISSED');

-- CreateEnum
CREATE TYPE "AdminAuditTargetType" AS ENUM ('EMPLOYER', 'JOB', 'JOB_REPORT');

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "targetType" "AdminAuditTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_targetType_targetId_createdAt_idx" ON "admin_audit_log"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_adminId_createdAt_idx" ON "admin_audit_log"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt");
