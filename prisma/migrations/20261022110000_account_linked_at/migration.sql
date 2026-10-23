ALTER TABLE "accounts"
ADD COLUMN "createdAt" TIMESTAMP(3);

-- Existing OAuth rows have no trustworthy link timestamp. Keep them unknown
-- rather than presenting the migration date as if it were the link date.
ALTER TABLE "accounts"
ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
