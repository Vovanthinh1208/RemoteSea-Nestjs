import { Injectable } from "@nestjs/common";
import { Prisma, type ScorecardRecommendation } from "@prisma/client";
import { ScorecardsRepository } from "./scorecards.repository";
import type { CreateScorecardDto } from "./dto/create-scorecard.dto";
import type { ScorecardAverages, ScorecardListItem } from "./interfaces";
import { InterviewsService } from "@/modules/interviews/interviews.service";
import {
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const HIRE_RECOMMENDATIONS: ReadonlySet<ScorecardRecommendation> = new Set([
  "STRONGLY_RECOMMEND",
  "RECOMMEND",
]);

const SCORECARD_RECOMMENDATIONS: ScorecardRecommendation[] = [
  "STRONGLY_RECOMMEND",
  "RECOMMEND",
  "NEUTRAL",
  "NOT_RECOMMEND",
  "STRONGLY_NOT_RECOMMEND",
];

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

const average = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return roundToTenth(present.reduce((sum, v) => sum + v, 0) / present.length);
};

// PB65 AC2 — computed on read from the scorecards themselves, so a newly
// submitted scorecard is reflected immediately (PB64 AC6 "tính toán lại điểm
// trung bình") without a stored aggregate that could drift.
export const buildScorecardAverages = (
  scorecards: Pick<
    ScorecardListItem,
    "technicalRating" | "communicationRating" | "cultureFitRating"
  >[],
): ScorecardAverages => {
  const technical = average(scorecards.map((s) => s.technicalRating));
  const communication = average(scorecards.map((s) => s.communicationRating));
  const cultureFit = average(scorecards.map((s) => s.cultureFitRating));
  return {
    technical,
    communication,
    cultureFit,
    overall: average(
      scorecards.flatMap((s) => [
        s.technicalRating,
        s.communicationRating,
        s.cultureFitRating,
      ]),
    ),
  };
};

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

    const recommendations = Object.fromEntries(
      SCORECARD_RECOMMENDATIONS.map((value) => [
        value,
        scorecards.filter((scorecard) => scorecard.recommendation === value)
          .length,
      ]),
    ) as Record<ScorecardRecommendation, number>;

    const roundNumbers = Array.from(
      new Set(scorecards.map((s) => s.round || 1)),
    ).sort((a, b) => a - b);
    const rounds = Object.fromEntries(
      roundNumbers.map((r) => {
        const roundScorecards = scorecards.filter((s) => (s.round || 1) === r);
        return [
          r,
          {
            round: r,
            roundName:
              roundScorecards.find((s) => s.roundName)?.roundName ??
              `Round ${r}`,
            count: roundScorecards.length,
            hireCount: roundScorecards.filter((s) =>
              HIRE_RECOMMENDATIONS.has(s.recommendation),
            ).length,
            averages: buildScorecardAverages(roundScorecards),
          },
        ];
      }),
    );

    return {
      scorecards,
      summary: {
        total: scorecards.length,
        hireCount,
        averages: buildScorecardAverages(scorecards),
        recommendations,
        rounds,
      },
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
        round: dto.round ?? 1,
        roundName: dto.roundName,
        recommendation: dto.recommendation,
        technicalRating: dto.technicalRating,
        communicationRating: dto.communicationRating,
        cultureFitRating: dto.cultureFitRating,
        strengths: dto.strengths,
        improvements: dto.improvements,
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
          `Already submitted feedback for interview round ${dto.round ?? 1}`,
          ErrorCode.SCORECARD_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }
}
