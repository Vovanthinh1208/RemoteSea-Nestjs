import { Injectable } from "@nestjs/common";
import { Prisma, type ScorecardRecommendation } from "@prisma/client";
import { ScorecardsRepository } from "./scorecards.repository";
import type { CreateScorecardDto } from "./dto/create-scorecard.dto";
import { InterviewsService } from "@/modules/interviews/interviews.service";
import {
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const HIRE_RECOMMENDATIONS: ReadonlySet<ScorecardRecommendation> = new Set([
  "STRONG_YES",
  "YES",
]);

@Injectable()
export class ScorecardsService {
  constructor(
    private readonly scorecardsRepository: ScorecardsRepository,
    private readonly interviewsService: InterviewsService,
  ) {}

  async list(applicationId: string) {
    const scorecards =
      await this.scorecardsRepository.findAllForApplication(applicationId);
    const hireCount = scorecards.filter((scorecard) =>
      HIRE_RECOMMENDATIONS.has(scorecard.recommendation),
    ).length;

    return {
      scorecards,
      summary: { total: scorecards.length, hireCount },
    };
  }

  async create(
    applicationId: string,
    authorId: string,
    dto: CreateScorecardDto,
  ) {
    if (!(await this.interviewsService.isComplete(applicationId))) {
      throw new ForbiddenApiException(
        "Not eligible to submit feedback for this interview yet",
        ErrorCode.SCORECARD_NOT_ELIGIBLE,
      );
    }

    try {
      return await this.scorecardsRepository.create({
        applicationId,
        authorId,
        recommendation: dto.recommendation,
        note: dto.note,
      });
    } catch (error) {
      // Race guard, same pattern as ReviewsService.create — a concurrent
      // duplicate submission can still hit the unique constraint even though
      // the frontend already hides "Add feedback" once it sees the caller's
      // own scorecard in the list.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictApiException(
          "Already submitted feedback for this interview",
          ErrorCode.SCORECARD_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }
}
