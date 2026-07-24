import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AlertsRepository } from "./alerts.repository";
import type { CreateAlertDto } from "./dto/create-alert.dto";
import type { UpdateAlertDto } from "./dto/update-alert.dto";
import { FREQUENCY_GAP_MS, SEND_CONCURRENCY } from "./constants";
import type { CronDispatchResult } from "./interfaces";
import { EmailService } from "@/common/services/email.service";

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  // Guards against two dispatchCron() runs overlapping on this instance — e.g.
  // the external scheduler's own HTTP timeout is shorter than a full run and
  // it retries. Per-alert double-send is already prevented by claimForSend's
  // atomic conditional update regardless, so this isn't a correctness fix —
  // it just stops a slow run from doubling findActiveAlerts()/job-matching
  // query load on the DB at exactly the moment it's already running slow.
  // Process-local only: it does nothing for two *different* replicas racing,
  // same scope as this app's in-memory rate limiter and cache.
  private dispatchInProgress = false;

  constructor(
    private readonly alertsRepository: AlertsRepository,
    private readonly emailService: EmailService,
  ) {}

  listForUser(userId: string) {
    return this.alertsRepository.findByUser(userId);
  }

  create(userId: string, dto: CreateAlertDto) {
    const { categoryIds, ...alertData } = dto;
    return this.alertsRepository.create(userId, alertData, categoryIds);
  }

  // Ownership is already enforced by AlertOwnershipGuard before these run.
  async update(id: string, dto: UpdateAlertDto) {
    return this.alertsRepository.updateActive(id, dto.isActive);
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.alertsRepository.delete(id);
    return { success: true };
  }

  async dispatchCron(): Promise<CronDispatchResult> {
    if (this.dispatchInProgress) {
      this.logger.warn(
        "Skipped dispatchCron: a previous run on this instance is still in progress.",
      );
      return { processed: 0, sent: 0 };
    }

    this.dispatchInProgress = true;
    try {
      const now = Date.now();
      const alerts = await this.alertsRepository.findActiveAlerts();

      let sent = 0;

      // Processed in bounded-size chunks (not all at once) so a large batch doesn't
      // fire hundreds of simultaneous outbound email requests in one burst.
      for (let i = 0; i < alerts.length; i += SEND_CONCURRENCY) {
        const chunk = alerts.slice(i, i + SEND_CONCURRENCY);
        const results = await Promise.all(
          chunk.map((alert) => this.dispatchOne(alert, now)),
        );
        sent += results.filter(Boolean).length;
      }

      // Logged unconditionally (including processed=0) — this cron only runs
      // over HTTP, so without this the only trace of a successful run is a
      // generic access-log line with no counts, making "not running" and
      // "running with nothing to send" indistinguishable from the logs alone.
      this.logger.log(
        `dispatchCron finished: processed ${alerts.length} alert(s), sent ${sent} email(s) in ${Date.now() - now}ms`,
      );
      return { processed: alerts.length, sent };
    } finally {
      this.dispatchInProgress = false;
    }
  }

  private async dispatchOne(
    alert: Awaited<ReturnType<AlertsRepository["findActiveAlerts"]>>[number],
    now: number,
  ): Promise<boolean> {
    const gap = FREQUENCY_GAP_MS[alert.frequency];
    if (alert.lastSentAt && now - alert.lastSentAt.getTime() < gap)
      return false;

    const since =
      alert.lastSentAt ?? new Date(now - gap || now - FREQUENCY_GAP_MS.DAILY);

    const where: Prisma.JobWhereInput = {
      status: "ACTIVE",
      publishedAt: { gt: since, lte: new Date() },
      ...(alert.jobType && { jobType: alert.jobType }),
      ...(alert.level && { level: alert.level }),
      ...(alert.country && { country: alert.country }),
      ...(alert.salaryMin && { salaryMin: { gte: alert.salaryMin } }),
      ...(alert.keywords && {
        OR: [
          { title: { contains: alert.keywords, mode: "insensitive" } },
          { description: { contains: alert.keywords, mode: "insensitive" } },
        ],
      }),
      ...(alert.categories.length && {
        categories: {
          some: {
            categoryId: { in: alert.categories.map((c) => c.categoryId) },
          },
        },
      }),
    };

    const jobs = await this.alertsRepository.findMatchingJobs(where);
    if (jobs.length === 0) return false;

    // Each alert is claimed (lastSentAt conditionally updated) before its email is
    // sent, not after — this closes the race where two overlapping cron runs both
    // read the same stale lastSentAt and double-send. A crash/failure after the
    // claim just means that alert waits for the next window instead of retrying,
    // which is the safer failure mode for a non-critical notification email.
    const claimed = await this.alertsRepository.claimForSend(
      alert.id,
      alert.lastSentAt,
    );
    if (!claimed) return false;

    try {
      await this.emailService.sendJobAlertEmail(alert.user.email, jobs);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send alert email for alert ${alert.id}`,
        error instanceof Error ? error.stack : error,
      );
      return false;
    }
  }
}
