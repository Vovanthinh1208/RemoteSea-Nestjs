export type CircuitState = "closed" | "open" | "half-open";

/**
 * Minimal in-process circuit breaker: after `failureThreshold` consecutive
 * failures, opens for `cooldownMs` and fails fast — the caller skips the
 * attempt entirely instead of paying the full timeout of a call to a
 * dependency that's already down. After the cooldown, the next call is let
 * through as a trial (half-open): success closes the circuit and resets the
 * failure count, another failure re-opens it immediately for a fresh
 * cooldown rather than waiting for the threshold again.
 *
 * Scoped to this process only, same as RateLimitService and the in-memory
 * cache — behind multiple replicas each holds its own state, so one
 * replica's breaker opening doesn't protect the others. That's an accepted,
 * pre-existing limitation in this repo (see rate-limit.service.ts), not
 * something new introduced here.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  /**
   * True if a call should be skipped without attempting it. Transitions
   * open -> half-open once the cooldown has elapsed, letting exactly one
   * call through as a trial (this method's own caller is expected to then
   * report onSuccess/onFailure for that trial).
   */
  isOpen(now: number = Date.now()): boolean {
    if (this.state !== "open") return false;
    if (now - this.openedAt < this.cooldownMs) return true;
    this.state = "half-open";
    return false;
  }

  onSuccess(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
  }

  onFailure(now: number = Date.now()): void {
    this.consecutiveFailures += 1;
    const shouldOpen =
      this.state === "half-open" ||
      this.consecutiveFailures >= this.failureThreshold;
    if (shouldOpen) {
      this.state = "open";
      this.openedAt = now;
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
