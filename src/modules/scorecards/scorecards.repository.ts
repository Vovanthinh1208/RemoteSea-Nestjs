import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import {
  scorecardListItemSelect,
  type CreateScorecardInput,
  type ScorecardListItem,
} from "./interfaces";

// Only ever touches the interview_scorecards table — eligibility (which
// needs the interviews table) is InterviewsService's job, injected into
// ScorecardsService directly rather than queried from here. See
// ScorecardsModule's comment.
@Injectable()
export class ScorecardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Ordered oldest-first — a scorecard thread reads like a sequence of
  // independent verdicts, not a feed where the newest opinion should lead.
  findAllForApplication(applicationId: string): Promise<ScorecardListItem[]> {
    return this.prisma.interviewScorecard.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
      select: scorecardListItemSelect,
    });
  }

  create(input: CreateScorecardInput): Promise<ScorecardListItem> {
    return this.prisma.interviewScorecard.create({
      data: input,
      select: scorecardListItemSelect,
    });
  }
}
