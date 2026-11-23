CREATE TABLE "company_verification_documents" (
  "id" TEXT NOT NULL,
  "employerId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "contents" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_verification_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_verification_documents_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_verification_documents_size_check" CHECK ("byteLength" > 0 AND "byteLength" <= 5242880 AND octet_length("contents") = "byteLength")
);
CREATE UNIQUE INDEX "company_verification_documents_employerId_sha256_key" ON "company_verification_documents"("employerId", "sha256");
CREATE INDEX "company_verification_documents_employerId_createdAt_idx" ON "company_verification_documents"("employerId", "createdAt");
