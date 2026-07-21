-- users.emailVerified was a leftover from this project's original NextAuth.js
-- Prisma adapter (which requires that column on its User model) — this API's
-- own JWT-based auth never reads or writes it. Zero references anywhere in
-- src/, confirmed before dropping.

ALTER TABLE "users" DROP COLUMN "emailVerified";
