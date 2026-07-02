import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AlertsRepository } from "./alerts.repository";
import type { CreateAlertDto } from "./dto/create-alert.dto";
import type { UpdateAlertDto } from "./dto/update-alert.dto";
import { FREQUENCY_GAP_MS } from "./constants";
import type { CronDispatchResult } from "./interfaces";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import { EmailService } from "@/common/services/email.service";

@Injectable()
export class AlertsService {
  constructor(
    private readonly alertsRepository: AlertsRepository,
    private readonly emailService: EmailService
  ) {}

  listForUser(userId: string) {
    return this.alertsRepository.findByUser(userId);
  }

  create(userId: string, dto: CreateAlertDto) {
    const { categoryIds, ...alertData } = dto;
    return this.alertsRepository.create(userId, alertData, categoryIds);
  }

  private async assertOwnership(userId: string, id: string): Promise<void> {
    const alert = await this.alertsRepository.findOwnerById(id);
    if (!alert || alert.userId !== userId) {
      throw new NotFoundApiException("Not found");
    }
  }

  async update(userId: string, id: string, dto: UpdateAlertDto) {
    await this.assertOwnership(userId, id);
    return this.alertsRepository.updateActive(id, dto.isActive);
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    await this.assertOwnership(userId, id);
    await this.alertsRepository.delete(id);
    return { success: true };
  }

  async dispatchCron(): Promise<CronDispatchResult> {
    const now = Date.now();
    const alerts = await this.alertsRepository.findActiveAlerts();

    let sent = 0;

    for (const alert of alerts) {
      const gap = FREQUENCY_GAP_MS[alert.frequency];
      if (alert.lastSentAt && now - alert.lastSentAt.getTime() < gap) continue;

      const since = alert.lastSentAt ?? new Date(now - gap || now - FREQUENCY_GAP_MS.DAILY);

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
          categories: { some: { categoryId: { in: alert.categories.map((c) => c.categoryId) } } },
        }),
      };

      const jobs = await this.alertsRepository.findMatchingJobs(where);
      if (jobs.length === 0) continue;

      await this.emailService.sendJobAlertEmail(alert.user.email, jobs);
      await this.alertsRepository.markSent(alert.id);
      sent += 1;
    }

    return { processed: alerts.length, sent };
  }
}
