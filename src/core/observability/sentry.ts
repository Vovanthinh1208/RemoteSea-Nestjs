import * as Sentry from "@sentry/node";

export type ReportContext = {
  /** Correlates a Sentry event back to the same request's access-log line
   * (see request-id.middleware.ts) — without this, "which request produced
   * this stack trace" required guessing from the timestamp alone. */
  requestId?: string;
  /** Only ever an id, never email/name — matches this app's existing
   * "don't over-collect PII" posture elsewhere (e.g. OrchestratorAuthGuard's
   * own comment on what it puts on request.user). */
  userId?: string;
};

// Error tracking only — no performance tracing/profiling wired up (that
// needs its own sampling/cost tradeoffs this app hasn't made yet). Unset
// SENTRY_DSN means this is never called, not a boot failure, same
// convention as every other optional integration in env.validation.ts.
// `environment`/`release` are both optional at the Sentry API level too —
// an unset RELEASE_VERSION (no deploy pipeline wiring it in yet) still
// initializes normally, just without release-based regression tracking.
export function initSentry(
  dsn: string | undefined,
  environment?: string,
  release?: string,
): void {
  if (!dsn) return;
  Sentry.init({ dsn, environment, release, tracesSampleRate: 0 });
}

// Safe to call unconditionally regardless of whether initSentry ran —
// GlobalExceptionFilter's fallback branch is the one place every truly
// unexpected error in this app converges, DSN configured or not.
export function reportException(
  exception: unknown,
  context: ReportContext = {},
): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(exception, {
    tags: { requestId: context.requestId },
    user: context.userId ? { id: context.userId } : undefined,
  });
}

// Sentry sends events over the network asynchronously — a process.exit()
// right after reportException would very likely kill the process before the
// event actually goes out. Only main.ts's crash handlers need this (the
// GlobalExceptionFilter path keeps the process alive on its own); safe to
// call even when Sentry was never initialized (resolves immediately).
export async function flushSentry(timeoutMs: number): Promise<void> {
  if (!Sentry.isInitialized()) return;
  await Sentry.flush(timeoutMs).catch(() => undefined);
}
