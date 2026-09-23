import { ApiException } from "@/common/exceptions/api.exception";

// Shared by every dashboard-aggregate endpoint (GET /employer/dashboard,
// GET /talent/me/dashboard, ...) that composes several existing service
// calls via Promise.all: any ApiException one of them throws is already a
// recognized, classified "no access/no data for this caller" condition
// (membership required, profile not found, ...) — same "an ApiException is
// an expected condition" distinction GlobalExceptionFilter draws for the
// whole app. Swallowed to null so one piece not applying to this caller
// doesn't fail the rest of the dashboard. A raw unclassified error (DB down,
// a bug) is NOT swallowed — it rethrows, failing the whole aggregate request
// (and getting logged/Sentry-reported the normal way) rather than silently
// presenting as "you have nothing yet" for a caller who very much does.
export function nullOnExpectedError(error: unknown): null {
  if (error instanceof ApiException) return null;
  throw error;
}
