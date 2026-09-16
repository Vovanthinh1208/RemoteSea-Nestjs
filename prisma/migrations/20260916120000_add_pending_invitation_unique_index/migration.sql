-- Partial unique index — Prisma's schema DSL can't express a WHERE clause
-- on @@unique, so this isn't reflected in schema.prisma (same as the
-- pg_trgm/search-vector indexes elsewhere in this migration history).
-- Closes a check-then-act race in TeamService.inviteMember: two concurrent
-- invite requests for the same (employerId, email) could both pass the
-- findPendingInvitationByEmail check before either wrote, creating two live
-- PENDING invitations for the same person. Scoped to status = 'PENDING' so
-- ACCEPTED/REVOKED history for the same email can still accumulate freely —
-- only one *live* invitation per (employer, email) at a time.
CREATE UNIQUE INDEX "team_invitations_employerId_email_pending_key"
  ON "team_invitations" ("employerId", "email")
  WHERE "status" = 'PENDING';
