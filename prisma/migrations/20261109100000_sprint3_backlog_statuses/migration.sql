-- Canonical vocabulary from Product Backlog v1.1, PB53/PB56/PB60.
-- PostgreSQL renames enum labels in place, preserving rows, FK references,
-- defaults and status-event history. Deploy with the matching API/Web release.
BEGIN;
ALTER TYPE "ApplicationStatus" RENAME VALUE 'PENDING' TO 'APPLIED';
ALTER TYPE "ApplicationStatus" RENAME VALUE 'OFFER_ACCEPTED' TO 'ACCEPTED';
ALTER TYPE "ApplicationStatus" RENAME VALUE 'OFFER_DECLINED' TO 'DECLINED';
ALTER TYPE "InterviewStatus" RENAME VALUE 'PENDING' TO 'PROPOSED';
COMMIT;
