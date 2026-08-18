import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import { applicationPartiesSelect } from "@/common/interfaces/application-parties.interface";
import {
  interviewSelect,
  type InterviewRecord,
  type UpsertInterviewInput,
} from "./interfaces";

@Injectable()
export class InterviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByApplicationId(applicationId: string): Promise<InterviewRecord | null> {
    return this.prisma.interview.findUnique({
      where: { applicationId },
      select: interviewSelect,
    });
  }

  // Single-actor action (only the owning employer ever calls this — no
  // concurrent other-party race the way confirmSlot below has), so a plain
  // upsert is enough; InterviewsService checks the "not already CONFIRMED"
  // precondition before calling this.
  upsertPending(input: UpsertInterviewInput): Promise<InterviewRecord> {
    const data = {
      durationMinutes: input.durationMinutes,
      proposedSlots: input.proposedSlots,
      meetingUrl: input.meetingUrl,
    };
    return this.prisma.interview.upsert({
      where: { applicationId: input.applicationId },
      create: { applicationId: input.applicationId, ...data },
      update: data,
      select: interviewSelect,
    });
  }

  // CAS: only succeeds while still PENDING — returns null if it's already
  // CONFIRMED (a second confirm attempt) or a re-propose landed in between,
  // the real two-party race this flow has.
  async confirmSlot(
    applicationId: string,
    slot: Date,
  ): Promise<InterviewRecord | null> {
    const { count } = await this.prisma.interview.updateMany({
      where: { applicationId, status: "PENDING" },
      data: { status: "CONFIRMED", confirmedSlot: slot },
    });
    if (count === 0) return null;
    return this.findByApplicationId(applicationId);
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
