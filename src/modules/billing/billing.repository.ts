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

  // Guards against Stripe redelivering the same "checkout.session.completed"
  // event: only the first delivery actually flips planPaid, so a replay is a
  // no-op instead of re-sending the "payment received" email.
  async markJobPaidAndSubmitted(jobId: string): Promise<JobWithEmployerEmail | null> {
    const { count } = await this.prisma.job.updateMany({
      where: { id: jobId, planPaid: false },
      data: { planPaid: true, paidAt: new Date(), status: "PENDING_REVIEW" },
    });
    if (count === 0) return null;

    return this.prisma.job.findUnique({ where: { id: jobId }, include: jobWithEmployerEmailInclude });
  }
}
