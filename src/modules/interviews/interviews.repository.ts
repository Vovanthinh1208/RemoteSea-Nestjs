import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import { applicationPartiesSelect } from "@/common/interfaces/application-parties.interface";
import {
  interviewSelect,
  upcomingInterviewSelect,
  type InterviewContacts,
  type InterviewRecord,
  type UpcomingInterviewRow,
  type UpsertInterviewInput,
} from "./interfaces";
import type { InterviewEligibilityShape } from "./interview-eligibility.util";

@Injectable()
export class InterviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByApplicationId(applicationId: string): Promise<InterviewRecord | null> {
    return this.prisma.interview.findUnique({
      where: { applicationId },
      select: interviewSelect,
    });
  }

  // Narrow eligibility-only select, backing InterviewsService.isComplete —
  // callers that only need "has this interview happened" (ReviewsService via
  // its own bundled select, ScorecardsService via this one) shouldn't have
  // to pull the full interviewSelect shape (proposedSlots, meetingUrl,
  // interviewer, ...).
  findEligibilityByApplicationId(
    applicationId: string,
  ): Promise<InterviewEligibilityShape> {
    return this.prisma.interview.findUnique({
      where: { applicationId },
      select: { status: true, confirmedSlot: true },
    });
  }

  // A talent may confirm after the service's initial read. The write must
  // check status atomically, otherwise a stale proposal erases confirmation.
  async upsertProposed(
    input: UpsertInterviewInput,
  ): Promise<InterviewRecord | null> {
    const data = {
      title: input.title,
      platform: input.platform,
      durationMinutes: input.durationMinutes,
      proposedSlots: input.proposedSlots,
      meetingUrl: input.meetingUrl,
      interviewerId: input.interviewerId,
      status: "PROPOSED" as const,
      // A fresh proposal after a cancellation starts clean.
      cancelReason: null,
      cancelledAt: null,
      confirmedSlot: null,
    };
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.interview.findUnique({
        where: { applicationId: input.applicationId },
        select: { id: true },
      });
      if (!existing) {
        // Lock the parent so two first proposals serialize without a unique
        // constraint error. The transaction repeats the lookup after locking.
        await tx.$queryRaw`SELECT id FROM applications WHERE id = ${input.applicationId} FOR UPDATE`;
        const created = await tx.interview.findUnique({
          where: { applicationId: input.applicationId },
          select: { id: true },
        });
        if (!created)
          return tx.interview.create({
            data: { applicationId: input.applicationId, ...data },
            select: interviewSelect,
          });
      }
      const { count } = await tx.interview.updateMany({
        where: {
          applicationId: input.applicationId,
          status: { in: ["PROPOSED", "CANCELLED"] },
        },
        data,
      });
      if (count === 0) return null;
      return tx.interview.findUnique({
        where: { applicationId: input.applicationId },
        select: interviewSelect,
      });
    });
  }

  // CAS: only cancels while PROPOSED or CONFIRMED — a nonexistent interview or
  // one that's already CANCELLED both match zero rows and return null, same
  // no-op-on-race shape as confirmSlot above.
  async cancel(
    applicationId: string,
    reason: string,
  ): Promise<InterviewRecord | null> {
    const { count } = await this.prisma.interview.updateMany({
      where: { applicationId, status: { in: ["PROPOSED", "CONFIRMED"] } },
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    });
    if (count === 0) return null;
    return this.findByApplicationId(applicationId);
  }

  // CAS: only succeeds while still PROPOSED — returns null if it's already
  // CONFIRMED (a second confirm attempt) or a re-propose landed in between,
  // the real two-party race this flow has.
  async confirmSlot(
    applicationId: string,
    slot: Date,
  ): Promise<InterviewRecord | null> {
    const { count } = await this.prisma.interview.updateMany({
      where: {
        applicationId,
        status: "PROPOSED",
        proposedSlots: { has: slot },
      },
      data: { status: "CONFIRMED", confirmedSlot: slot },
    });
    if (count === 0) return null;
    return this.findByApplicationId(applicationId);
  }

  // Company-wide agenda (GET /employer/interviews/upcoming) — the one place
  // interviews are read across every application at a company instead of
  // for a single one. interviewerId narrows to "my interviews" for an
  // INTERVIEWER-role viewer (see InterviewsService.listUpcomingForCompany);
  // omitted, every other role sees the full agenda.
  findUpcomingForCompany(
    employerId: string,
    interviewerId: string | undefined,
  ): Promise<UpcomingInterviewRow[]> {
    return this.prisma.interview.findMany({
      where: {
        status: "CONFIRMED",
        confirmedSlot: { gte: new Date() },
        application: { job: { employerId } },
        ...(interviewerId ? { interviewerId } : {}),
      },
      orderBy: { confirmedSlot: "asc" },
      select: upcomingInterviewSelect,
    });
  }

  async findContacts(applicationId: string): Promise<InterviewContacts | null> {
    const row = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        talent: {
          select: {
            user: {
              select: {
                name: true,
                email: true,
                notificationPreference: {
                  select: { applicationUpdates: true },
                },
              },
            },
          },
        },
        job: {
          select: {
            employer: {
              select: {
                companyName: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
        interview: {
          select: { interviewer: { select: { name: true, email: true } } },
        },
      },
    });
    if (!row) return null;
    const talentUser = row.talent.user;
    return {
      talent: {
        name: talentUser.name,
        email: talentUser.email,
        // No preference row yet means the schema default (on).
        emailEnabled:
          talentUser.notificationPreference?.applicationUpdates ?? true,
      },
      employer: {
        name: row.job.employer.companyName,
        email: row.job.employer.user.email,
      },
      interviewer: row.interview?.interviewer ?? null,
    };
  }

  /** Self-contained narrow query (not a cross-import of ApplicationsRepository)
   * — same reasoning as messages.repository.ts's twin. Backs
   * TalentApplicationOwnershipGuard. */
  findApplicationForTalentOwnership(id: string) {
    return this.prisma.application.findUnique({
      where: { id },
      select: { ...applicationPartiesSelect, status: true },
    });
  }
}
