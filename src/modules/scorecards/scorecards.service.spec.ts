import { Prisma } from "@prisma/client";
import {
  ScorecardsService,
  buildScorecardAverages,
} from "./scorecards.service";
import type { ScorecardsRepository } from "./scorecards.repository";
import type { InterviewsService } from "@/modules/interviews/interviews.service";
import {
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";

const makeService = (
  repoOverrides: Partial<ScorecardsRepository> = {},
  isComplete = true,
) => {
  const repository = {
    findAllForApplication: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    ...repoOverrides,
  } as unknown as ScorecardsRepository;
  const interviewsService = {
    isComplete: jest.fn().mockResolvedValue(isComplete),
  } as unknown as InterviewsService;
  return {
    service: new ScorecardsService(repository, interviewsService),
    repository,
    interviewsService,
  };
};

// PB64 AC2–4: three 1–5 criteria, strengths/improvements, recommendation.
const validDto = {
  technicalRating: 4,
  communicationRating: 3,
  cultureFitRating: 5,
  strengths: "Strong system design.",
  improvements: "Testing strategy.",
  recommendation: "RECOMMEND" as const,
};

describe("ScorecardsService.create", () => {
  it("rejects when the interview hasn't happened yet", async () => {
    const { service, repository, interviewsService } = makeService({}, false);

    await expect(service.create("app-1", "user-1", validDto)).rejects.toThrow(
      ForbiddenApiException,
    );
    expect(interviewsService.isComplete).toHaveBeenCalledWith("app-1");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates once InterviewsService reports the interview complete", async () => {
    const { service, repository } = makeService({}, true);

    await service.create("app-1", "user-1", {
      ...validDto,
      recommendation: "STRONGLY_RECOMMEND",
      note: "Great signal.",
    });

    expect(repository.create).toHaveBeenCalledWith({
      applicationId: "app-1",
      authorId: "user-1",
      recommendation: "STRONGLY_RECOMMEND",
      technicalRating: 4,
      communicationRating: 3,
      cultureFitRating: 5,
      strengths: "Strong system design.",
      improvements: "Testing strategy.",
      note: "Great signal.",
    });
  });

  it("turns a duplicate-submission race (P2002) into a domain conflict", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "5.22.0",
    });
    const { service } = makeService(
      { create: jest.fn().mockRejectedValue(p2002) },
      true,
    );

    await expect(
      service.create("app-1", "user-1", {
        ...validDto,
        recommendation: "NOT_RECOMMEND",
      }),
    ).rejects.toThrow(ConflictApiException);
  });
});

describe("ScorecardsService.list", () => {
  it("returns an empty summary when nothing has been submitted yet", async () => {
    const { service } = makeService({
      findAllForApplication: jest.fn().mockResolvedValue([]),
    });

    const result = await service.list("app-1");

    expect(result).toEqual({
      scorecards: [],
      summary: {
        total: 0,
        hireCount: 0,
        averages: {
          technical: null,
          communication: null,
          cultureFit: null,
          overall: null,
        },
        recommendations: {
          STRONGLY_RECOMMEND: 0,
          RECOMMEND: 0,
          NEUTRAL: 0,
          NOT_RECOMMEND: 0,
          STRONGLY_NOT_RECOMMEND: 0,
        },
      },
    });
  });

  // PB65 AC2: averages per criterion + overall, and each recommendation
  // counted (NEUTRAL counts neither for nor against hiring).
  it("aggregates averages and recommendations across every scorecard", async () => {
    const card = (
      id: string,
      recommendation: string,
      ratings: [number | null, number | null, number | null],
    ) => ({
      id,
      recommendation,
      technicalRating: ratings[0],
      communicationRating: ratings[1],
      cultureFitRating: ratings[2],
    });
    const { service } = makeService({
      findAllForApplication: jest.fn().mockResolvedValue([
        card("1", "STRONGLY_RECOMMEND", [5, 4, 5]),
        card("2", "RECOMMEND", [4, 3, 4]),
        card("3", "NEUTRAL", [3, 3, 3]),
        card("4", "NOT_RECOMMEND", [2, 3, 2]),
        // A pre-PB64 row with no criterion ratings — counted, not averaged.
        card("5", "STRONGLY_NOT_RECOMMEND", [null, null, null]),
      ]),
    });

    const result = await service.list("app-1");

    expect(result.summary).toEqual({
      total: 5,
      hireCount: 2,
      averages: {
        technical: 3.5,
        communication: 3.3,
        cultureFit: 3.5,
        overall: 3.4,
      },
      recommendations: {
        STRONGLY_RECOMMEND: 1,
        RECOMMEND: 1,
        NEUTRAL: 1,
        NOT_RECOMMEND: 1,
        STRONGLY_NOT_RECOMMEND: 1,
      },
    });
  });
});

describe("buildScorecardAverages", () => {
  it("rounds to one decimal place", () => {
    expect(
      buildScorecardAverages([
        { technicalRating: 5, communicationRating: 4, cultureFitRating: 4 },
        { technicalRating: 4, communicationRating: 4, cultureFitRating: 5 },
        { technicalRating: 4, communicationRating: 5, cultureFitRating: 5 },
      ]),
    ).toEqual({
      technical: 4.3,
      communication: 4.3,
      cultureFit: 4.7,
      overall: 4.4,
    });
  });
});
