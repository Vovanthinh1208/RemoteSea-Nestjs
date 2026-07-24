import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { JobsRepository } from "./jobs.repository";

export const VIEW_COUNT_FLUSH_INTERVAL_MS = 10_000;

/**
 * Coalesces job-detail view counts in memory and flushes them on an interval,
 * instead of issuing one `UPDATE ... viewCount + 1` per view. Every view of a
 * popular job used to take a row lock on the same jobs row — harmless alone,
 * but under concurrent traffic those single-view updates serialize behind each
 * other and each one occupies a pool connection while queued. Batching turns N
 * views of a job per window into one `increment: N`.
 *
 * Views are analytics, not business state: the previous code already dropped
 * them on failure (fire-and-forget with a warn log), so losing an unflushed
 * window's counts on a hard crash is the same trade-off, not a new one.
 * Graceful shutdowns flush via onModuleDestroy.
 */
@Injectable()
export class ViewCountBuffer implements OnModuleDestroy {
  private readonly logger = new Logger(ViewCountBuffer.name);
  private pending = new Map<string, number>();
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly jobsRepository: JobsRepository) {
    this.timer = setInterval(() => {
      void this.flush();
    }, VIEW_COUNT_FLUSH_INTERVAL_MS);
    // A pending flush must never be what keeps the process alive.
    this.timer.unref();
  }

  record(jobId: string): void {
    this.pending.set(jobId, (this.pending.get(jobId) ?? 0) + 1);
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Map();

    // Concurrent, not one-at-a-time — these are independent updates to
    // different job rows, so there's no reason to pay N sequential DB
    // round-trips on every flush tick instead of letting Prisma's own
    // connection pool bound the real concurrency.
    const results = await Promise.all(
      Array.from(batch, ([jobId, count]) =>
        this.jobsRepository
          .incrementViewCountBy(jobId, count)
          .then(() => true)
          .catch((error: unknown) => {
            // Same policy as the old per-view fire-and-forget: log and drop.
            this.logger.warn(
              `Failed to flush ${count} view(s) for job ${jobId}`,
              error instanceof Error ? error.stack : error,
            );
            return false;
          }),
      ),
    );

    // debug (not log): this fires every VIEW_COUNT_FLUSH_INTERVAL_MS across
    // every instance whenever there's been any traffic, unlike the alerts
    // cron below which only runs when its (much less frequent) scheduler
    // fires — a per-tick `log` line here would just be noise most of the
    // time. Still gives an operator something to grep for "were flushes
    // succeeding" during an incident, without a debug build.
    const failed = results.filter((ok) => !ok).length;
    this.logger.debug(
      `Flushed view counts for ${batch.size} job(s)${failed ? ` (${failed} failed)` : ""}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}
