ALTER TABLE "users"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Preserve verified state for existing talent accounts while exposing the
-- account-level flag required by PB22.
UPDATE "users" AS u
SET "emailVerified" = true
FROM "talent_profiles" AS t
WHERE t."userId" = u."id"
  AND t."isVerified" = true;
