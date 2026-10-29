import { CvAnalysisService } from "./cv-analysis.service";
import type { CvAnalysisRepository } from "./cv-analysis.repository";
import type { ResumeExtractionService } from "./resume-extraction.service";
import type { AiService } from "@/modules/ai/ai.service";
import {
  BadRequestApiException,
  ServiceUnavailableApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const source = {
  resumeUrl: "https://cdn.example.com/resume.pdf",
  job: {
    title: "Senior Backend Engineer",
    description: "Build and own our core API.",
    requirements: "5+ years Node.js",
    level: "SENIOR",
  },
};

const validLlmText = JSON.stringify({
  fitScore: 80,
  summary: "Strong overlap with the role.",
  strengths: ["5 years Node.js"],
  gaps: [],
  suggestedQuestions: [],
  recommendation: "PROCEED",
  recommendationReason: "Directly relevant experience.",
});

const makeService = (
  overrides: {
    repository?: Partial<CvAnalysisRepository>;
    resumeExtractionService?: Partial<ResumeExtractionService>;
    aiService?: Partial<AiService>;
  } = {},
) => {
  const repository = {
    findByApplicationId: jest.fn().mockResolvedValue(null),
    findSourceForApplication: jest.fn().mockResolvedValue(source),
    create: jest
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ id: "cva-1", createdAt: new Date(), ...input }),
      ),
    replace: jest
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ id: "cva-1", createdAt: new Date(), ...input }),
      ),
    ...overrides.repository,
  } as unknown as CvAnalysisRepository;

  const resumeExtractionService = {
    extractText: jest.fn().mockResolvedValue("Resume text"),
    ...overrides.resumeExtractionService,
  } as unknown as ResumeExtractionService;

  const aiService = {
    isConfigured: true,
    complete: jest
      .fn()
      .mockResolvedValue({ text: validLlmText, model: "claude-haiku-4-5" }),
    ...overrides.aiService,
  } as unknown as AiService;

  return {
    service: new CvAnalysisService(
      repository,
      resumeExtractionService,
      aiService,
    ),
    repository,
    resumeExtractionService,
    aiService,
  };
};

describe("CvAnalysisService.getOrCreate", () => {
  it("returns the cached analysis without calling the AI when one already exists", async () => {
    const existing = { id: "cva-1", fitScore: 80 };
    const { service, repository, aiService } = makeService({
      repository: {
        findByApplicationId: jest.fn().mockResolvedValue(existing),
      },
    });

    const result = await service.getOrCreate("app-1");

    expect(result).toBe(existing);
    expect(aiService.complete).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("calls the AI and persists via create (not replace) when nothing is cached yet", async () => {
    const { service, repository } = makeService();

    const result = await service.getOrCreate("app-1");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        recommendation: "PROCEED",
      }),
    );
    expect(repository.replace).not.toHaveBeenCalled();
    expect(result.recommendation).toBe("PROCEED");
  });

  it("throws BadRequest without calling the AI when the applicant has no resume", async () => {
    const { service, aiService } = makeService({
      repository: {
        findByApplicationId: jest.fn().mockResolvedValue(null),
        findSourceForApplication: jest
          .fn()
          .mockResolvedValue({ ...source, resumeUrl: null }),
      },
    });

    const error = await service.getOrCreate("app-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.CV_ANALYSIS_NO_RESUME,
    });
    expect(aiService.complete).not.toHaveBeenCalled();
  });

  it("throws 503 without calling the AI when it isn't configured", async () => {
    const { service, aiService } = makeService({
      aiService: { isConfigured: false },
    });

    await expect(service.getOrCreate("app-1")).rejects.toThrow(
      ServiceUnavailableApiException,
    );
    expect(aiService.complete).not.toHaveBeenCalled();
  });
});

describe("CvAnalysisService.regenerate", () => {
  it("calls the AI and overwrites via replace even when an analysis already exists", async () => {
    const existing = { id: "cva-1", fitScore: 40 };
    const { service, repository, aiService } = makeService({
      repository: {
        findByApplicationId: jest.fn().mockResolvedValue(existing),
      },
    });

    const result = await service.regenerate("app-1");

    expect(aiService.complete).toHaveBeenCalledTimes(1);
    expect(repository.replace).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "app-1" }),
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(result.fitScore).toBe(80);
  });

  // Two tabs regenerating the same application at once shouldn't fire two
  // paid LLM calls before either write lands — same guarantee getOrCreate
  // gives via the same SingleFlight instance/key.
  it("collapses a concurrent getOrCreate and regenerate for the same application into one AI call", async () => {
    const { service, aiService } = makeService();

    await Promise.all([
      service.getOrCreate("app-1"),
      service.regenerate("app-1"),
    ]);

    expect(aiService.complete).toHaveBeenCalledTimes(1);
  });
});
