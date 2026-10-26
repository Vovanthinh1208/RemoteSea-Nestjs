-- PB31/PB33: company settings fields (all optional, so existing rows stay valid).
ALTER TABLE "employer_profiles" ADD COLUMN "hqAddress" TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "employer_profiles" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN "coverImageUrl" TEXT;

-- PB32: count wrong OTP entries per verification code.
ALTER TABLE "employer_email_verifications" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
