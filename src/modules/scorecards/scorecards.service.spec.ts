import { Prisma } from "@prisma/client";
import { ScorecardsService } from "./scorecards.service";
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

describe("ScorecardsService.create", () => {
  it("rejects when the interview hasn't happened yet", async () => {
    const { service, repository, interviewsService } = makeService({}, false);

    await expect(
      service.create("app-1", "user-1", { recommendation: "YES" }),
    ).rejects.toThrow(ForbiddenApiException);
    expect(interviewsService.isComplete).toHaveBeenCalledWith("app-1");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates once InterviewsService reports the interview complete", async () => {
    const { service, repository } = makeService({}, true);

    await service.create("app-1", "user-1", {
      recommendation: "STRONG_YES",
      note: "Great signal.",
    });

    expect(repository.create).toHaveBeenCalledWith({
      applicationId: "app-1",
      authorId: "user-1",
      recommendation: "STRONG_YES",
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
      service.create("app-1", "user-1", { recommendation: "NO" }),
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
      summary: { total: 0, hireCount: 0 },
    });
  });

  it("counts STRONG_YES/YES as hire recommendations, NO/STRONG_NO as not", async () => {
    const { service } = makeService({
      findAllForApplication: jest.fn().mockResolvedValue([
        { id: "1", recommendation: "STRONG_YES" },
        { id: "2", recommendation: "YES" },
        { id: "3", recommendation: "NO" },
        { id: "4", recommendation: "STRONG_NO" },
      ]),
    });

    const result = await service.list("app-1");

    expect(result.summary).toEqual({ total: 4, hireCount: 2 });
  });
});
