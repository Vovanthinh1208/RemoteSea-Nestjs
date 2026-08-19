import { Injectable } from "@nestjs/common";
import { Prisma, type Job } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

// Wider than jobWithEmployerEmailInclude (which only carries employer.user.
// email) — BillingService's auto-approval check also needs employer.
// isVerified and the job's category count.
const jobPaidAndSubmittedInclude = {
  employer: {
    select: { isVerified: true, user: { select: { email: true } } },
  },
  categories: { select: { categoryId: true } },
} satisfies Prisma.JobInclude;

export type JobPaidAndSubmitted = Prisma.JobGetPayload<{
  include: typeof jobPaidAndSubmittedInclude;
}>;

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Backs JobPayerOwnershipGuard + BillingService.createCheckoutSession — narrow
  // select, not the full Job row: those are the only fields that method reads.
  findJobWithEmployer(jobId: string) {
    return this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        status: true,
        planPaid: true,
        planType: true,
        employerId: true,
      },
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
  async markJobPaidAndSubmitted(
    jobId: string,
  ): Promise<JobPaidAndSubmitted | null> {
    // planType is immutable after creation (nothing in this codebase ever
    // updates it), so reading it ahead of the CAS write below can't race —
    // it can only ever match what the write eventually sees.
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { planType: true },
    });
    if (!job) return null;

    const { count } = await this.prisma.job.updateMany({
      where: { id: jobId, planPaid: false },
      data: {
        planPaid: true,
        paidAt: new Date(),
        status: "PENDING_REVIEW",
        // FEATURED/HANDS_ON are the whole point of paying more than
        // STANDARD — this is what actually turns on the sort boost
        // (isFeatured desc) and the "Featured" badge, both of which
        // already existed and simply had nothing to read.
        isFeatured: job.planType !== "STANDARD",
      },
    });
    if (count === 0) return null;

    return this.prisma.job.findUnique({
      where: { id: jobId },
      include: jobPaidAndSubmittedInclude,
    });
  }
}
