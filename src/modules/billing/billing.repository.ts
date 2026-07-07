import { Injectable } from "@nestjs/common";
import type { Job } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  jobWithEmployerEmailInclude,
  type JobWithEmployerEmail,
} from "@/common/types/job-with-employer-email.type";

type JobWithEmployerUserId = Job & { employer: { userId: string } };

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findJobWithEmployer(jobId: string): Promise<JobWithEmployerUserId | null> {
    return this.prisma.job.findUnique({
      where: { id: jobId },
      include: { employer: { select: { userId: true } } },
    });
  }

  setStripeSessionId(jobId: string, stripeSessionId: string): Promise<Job> {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { stripeSessionId },
    });
  }

  markJobPaidAndSubmitted(jobId: string): Promise<JobWithEmployerEmail> {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { planPaid: true, paidAt: new Date(), status: "PENDING_REVIEW" },
      include: jobWithEmployerEmailInclude,
    });
  }
}
