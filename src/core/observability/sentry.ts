import * as Sentry from "@sentry/node";

// Error tracking only — no performance tracing/profiling wired up (that
// needs its own sampling/cost tradeoffs this app hasn't made yet). Unset
// SENTRY_DSN means this is never called, not a boot failure, same
// convention as every other optional integration in env.validation.ts.
export function initSentry(dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

// Safe to call unconditionally regardless of whether initSentry ran —
// GlobalExceptionFilter's fallback branch is the one place every truly
// unexpected error in this app converges, DSN configured or not.
export function reportException(exception: unknown): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(exception);
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
