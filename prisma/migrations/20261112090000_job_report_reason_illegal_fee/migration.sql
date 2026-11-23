-- PB88 AC2: "Thu phí trái phép" (illegal fee collection) is a distinct report reason.
-- Additive only: existing ALREADY_FILLED / DUPLICATE rows stay valid.
ALTER TYPE "JobReportReason" ADD VALUE IF NOT EXISTS 'ILLEGAL_FEE' AFTER 'SCAM';
