-- Preserve all historical reports. Only the oldest per reporter/job remains
-- canonical for uniqueness; no report or its content is deleted.
ALTER TABLE "job_reports" ADD COLUMN "legacyDuplicate" BOOLEAN NOT NULL DEFAULT false;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY "jobId", "reporterId" ORDER BY "createdAt", id) AS n
  FROM "job_reports"
)
UPDATE "job_reports" r SET "legacyDuplicate" = true FROM ranked WHERE ranked.id = r.id AND ranked.n > 1;
CREATE UNIQUE INDEX "job_reports_reporter_job_unique" ON "job_reports" ("jobId", "reporterId") WHERE NOT "legacyDuplicate";

DROP INDEX IF EXISTS "job_invitations_jobId_talentId_key";
CREATE INDEX "job_invitations_jobId_talentId_idx" ON "job_invitations" ("jobId", "talentId");
CREATE UNIQUE INDEX "job_invitations_pending_pair_unique" ON "job_invitations" ("jobId", "talentId") WHERE status = 'PENDING';

ALTER TABLE "admin_audit_log" ADD COLUMN "ipAddress" TEXT;
CREATE INDEX "admin_audit_log_action_createdAt_idx" ON "admin_audit_log" (action, "createdAt");
CREATE FUNCTION remotesea_prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Admin audit log is append-only';
END;
$$;
CREATE TRIGGER admin_audit_log_append_only BEFORE UPDATE OR DELETE ON "admin_audit_log"
FOR EACH ROW EXECUTE FUNCTION remotesea_prevent_audit_mutation();
