import { JobModerationService } from "./job-moderation.service";
import type { JobModerationRepository } from "./job-moderation.repository";
import type { AiService } from "@/modules/ai/ai.service";
import {
  NotFoundApiException,
  ServiceUnavailableApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const source = {
  title: "Senior Backend Engineer",
  description: "Build and own our core API.",
  requirements: "5+ years Node.js",
  salaryMin: 3000,
  salaryMax: 5000,
  currency: "USD",
  country: "Vietnam",
  isRemote: true,
  employer: { companyName: "Acme Inc" },
};

const validLlmText = JSON.stringify({
  riskLevel: "LOW",
  reasons: [],
  summary: "Reads as a normal, legitimate posting.",
});

const makeService = (
  overrides: {
    repository?: Partial<JobModerationRepository>;
    aiService?: Partial<AiService>;
  } = {},
) => {
  const repository = {
    findByJobId: jest.fn().mockResolvedValue(null),
    findSourceForJob: jest.fn().mockResolvedValue(source),
    create: jest.fn().mockImplementation((input) =>
      Promise.resolve({
        id: "jmf-1",
        riskLevel: input.riskLevel,
        reasons: input.reasons,
        summary: input.summary,
        model: input.model,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ),
    replace: jest.fn().mockImplementation((input) =>
      Promise.resolve({
        id: "jmf-1",
        riskLevel: input.riskLevel,
        reasons: input.reasons,
        summary: input.summary,
        model: input.model,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ),
    ...overrides.repository,
  } as unknown as JobModerationRepository;

  const aiService = {
    isConfigured: true,
    complete: jest
      .fn()
      .mockResolvedValue({ text: validLlmText, model: "claude-haiku-4-5" }),
    ...overrides.aiService,
  } as unknown as AiService;

  return {
    service: new JobModerationService(repository, aiService),
    repository,
    aiService,
  };
};

describe("JobModerationService.getOrCreate", () => {
  it("returns the cached flag without calling the AI when one already exists", async () => {
    const existing = {
      id: "jmf-1",
      riskLevel: "LOW",
      reasons: [],
      summary: "cached",
      model: "claude-haiku-4-5",
      createdAt: new Date(),
    };
    const { service, repository, aiService } = makeService({
      repository: { findByJobId: jest.fn().mockResolvedValue(existing) },
    });

    const result = await service.getOrCreate("job-1");

    expect(result).toBe(existing);
    expect(aiService.complete).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("calls the AI, parses the response, and persists it when nothing is cached yet", async () => {
    const { service, repository, aiService } = makeService();

    const result = await service.getOrCreate("job-1");

    expect(aiService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Acme Inc"),
      }),
    );
    expect(repository.create).toHaveBeenCalledWith({
      jobId: "job-1",
      model: "claude-haiku-4-5",
      riskLevel: "LOW",
      reasons: [],
      summary: "Reads as a normal, legitimate posting.",
    });
    expect(result.riskLevel).toBe("LOW");
  });

  it("throws 503 without calling the AI when it isn't configured", async () => {
    const { service, aiService } = makeService({
      aiService: { isConfigured: false },
    });

    await expect(service.getOrCreate("job-1")).rejects.toThrow(
      ServiceUnavailableApiException,
    );
    expect(aiService.complete).not.toHaveBeenCalled();
  });

  it("throws NotFound for a job that doesn't exist", async () => {
    const { service } = makeService({
      repository: { findSourceForJob: jest.fn().mockResolvedValue(null) },
    });

    const error = await service
      .getOrCreate("missing-job")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_NOT_FOUND,
    });
  });

  it("throws 503 when the LLM response can't be parsed as the expected shape", async () => {
    const { service } = makeService({
      aiService: {
        isConfigured: true,
        complete: jest
          .fn()
          .mockResolvedValue({ text: "not json", model: "claude-haiku-4-5" }),
      },
    });

    const error = await service.getOrCreate("job-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableApiException);
    expect(
      (error as ServiceUnavailableApiException).getResponse(),
    ).toMatchObject({ code: ErrorCode.JOB_MODERATION_FAILED });
  });

  // Two admins opening the same never-before-checked job at once shouldn't
  // fire two paid LLM calls before either write lands — same guarantee
  // CvAnalysisService.getOrCreate gives via the same SingleFlight utility.
  it("collapses concurrent calls for the same job into a single AI request", async () => {
    const { service, aiService } = makeService();

    const [a, b] = await Promise.all([
      service.getOrCreate("job-1"),
      service.getOrCreate("job-1"),
    ]);

    expect(aiService.complete).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});

describe("JobModerationService.regenerate", () => {
  it("calls the AI and overwrites via replace even when a flag already exists", async () => {
    const existing = { id: "jmf-1", riskLevel: "HIGH" };
    const { service, repository, aiService } = makeService({
      repository: { findByJobId: jest.fn().mockResolvedValue(existing) },
    });

    const result = await service.regenerate("job-1");

    expect(aiService.complete).toHaveBeenCalledTimes(1);
    expect(repository.replace).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1" }),
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(result.riskLevel).toBe("LOW");
  });

  // A regenerate racing a concurrent getOrCreate for the same job shouldn't
  // fire two paid LLM calls before either write lands — same SingleFlight
  // guarantee as two concurrent getOrCreate calls above.
  it("collapses a concurrent getOrCreate and regenerate for the same job into one AI call", async () => {
    const { service, aiService } = makeService();

    await Promise.all([
      service.getOrCreate("job-1"),
      service.regenerate("job-1"),
    ]);

    expect(aiService.complete).toHaveBeenCalledTimes(1);
  });
});
