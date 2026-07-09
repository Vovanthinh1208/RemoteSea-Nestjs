import { Injectable } from "@nestjs/common";
import type { JobAlert, Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import { jobWithRelationsInclude, type JobWithRelations } from "@/common/types/job-with-relations.type";

const alertWithCategoriesInclude = {
  categories: { include: { category: true } },
} satisfies Prisma.JobAlertInclude;

type AlertWithCategories = Prisma.JobAlertGetPayload<{ include: typeof alertWithCategoriesInclude }>;

@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<AlertWithCategories[]> {
    return this.prisma.jobAlert.findMany({
      where: { userId },
      include: alertWithCategoriesInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  create(
    userId: string,
    alertData: Omit<Prisma.JobAlertUncheckedCreateInput, "userId" | "categories">,
    categoryIds: string[] | undefined
  ): Promise<AlertWithCategories> {
    return this.prisma.jobAlert.create({
      data: {
        ...alertData,
        userId,
        ...(categoryIds?.length && {
          categories: { create: categoryIds.map((id) => ({ categoryId: id })) },
        }),
      },
      include: alertWithCategoriesInclude,
    });
  }

  findOwnerById(id: string): Promise<Pick<JobAlert, "userId"> | null> {
    return this.prisma.jobAlert.findUnique({ where: { id }, select: { userId: true } });
  }

  updateActive(id: string, isActive: boolean): Promise<JobAlert> {
    return this.prisma.jobAlert.update({ where: { id }, data: { isActive } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.jobAlert.delete({ where: { id } });
  }

  findActiveAlerts() {
    return this.prisma.jobAlert.findMany({
      where: { isActive: true },
      include: {
        categories: { select: { categoryId: true } },
        user: { select: { email: true } },
      },
    });
  }

  findMatchingJobs(where: Prisma.JobWhereInput): Promise<JobWithRelations[]> {
    return this.prisma.job.findMany({
      where,
      take: 10,
      orderBy: { publishedAt: "desc" },
      include: jobWithRelationsInclude,
    }) as Promise<JobWithRelations[]>;
  }

  // Atomically claims an alert for sending: the update only applies if
  // lastSentAt still matches what the caller read, so two concurrent cron
  // runs (e.g. an overlapping retry) can't both send for the same alert.
  async claimForSend(id: string, expectedLastSentAt: Date | null): Promise<boolean> {
    const { count } = await this.prisma.jobAlert.updateMany({
      where: { id, lastSentAt: expectedLastSentAt },
      data: { lastSentAt: new Date() },
    });
    return count === 1;
  }
}
