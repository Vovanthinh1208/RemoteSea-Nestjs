import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import { applicationPartiesSelect } from "@/common/interfaces/application-parties.interface";
import {
  interviewSelect,
  upcomingInterviewSelect,
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

  // Single-actor action (only the owning employer ever calls this — no
  // concurrent other-party race the way confirmSlot below has), so a plain
  // upsert is enough; InterviewsService checks the "not already CONFIRMED"
  // precondition before calling this.
  // status: "PENDING" is explicit here (not left to the schema's @default)
  // so re-proposing after a CANCELLED interview resets it back to PENDING —
  // InterviewsService.propose only ever calls this when existing is
  // undefined, PENDING, or CANCELLED (CONFIRMED is rejected before this
  // runs), so unconditionally setting it is correct in every case this
  // reaches.
  upsertPending(input: UpsertInterviewInput): Promise<InterviewRecord> {
    const data = {
      durationMinutes: input.durationMinutes,
      proposedSlots: input.proposedSlots,
      meetingUrl: input.meetingUrl,
      interviewerId: input.interviewerId,
      status: "PENDING" as const,
    };
    return this.prisma.interview.upsert({
      where: { applicationId: input.applicationId },
      create: { applicationId: input.applicationId, ...data },
      update: data,
      select: interviewSelect,
    });
  }

  // CAS: only cancels while PENDING or CONFIRMED — a nonexistent interview or
  // one that's already CANCELLED both match zero rows and return null, same
  // no-op-on-race shape as confirmSlot above.
  async cancel(applicationId: string): Promise<InterviewRecord | null> {
    const { count } = await this.prisma.interview.updateMany({
      where: { applicationId, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED" },
    });
    if (count === 0) return null;
    return this.findByApplicationId(applicationId);
  }

  // CAS: only succeeds while still PENDING — returns null if it's already
  // CONFIRMED (a second confirm attempt) or a re-propose landed in between,
  // the real two-party race this flow has.
  async confirmSlot(
    applicationId: string,
    slot: Date,
  ): Promise<InterviewRecord | null> {
    const { count } = await this.prisma.interview.updateMany({
      where: { applicationId, status: "PENDING", proposedSlots: { has: slot } },
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
