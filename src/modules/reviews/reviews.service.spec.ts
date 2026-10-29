import { Prisma } from "@prisma/client";
import { ReviewsService } from "./reviews.service";
import type { ReviewsRepository } from "./reviews.repository";
import type { ReviewApplicationContext } from "./interfaces";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const TALENT_USER_ID = "talent-user-1";
const EMPLOYER_USER_ID = "employer-user-1";

const PAST_SLOT = new Date(Date.now() - 60 * 60 * 1000);
const FUTURE_SLOT = new Date(Date.now() + 60 * 60 * 1000);

// "CONFIRMED" here always means "confirmed and already happened" (the
// common case nearly every test below wants) — confirmedSlot defaults to an
// hour in the past. The one test that needs a still-upcoming confirmed
// interview builds its own fixture instead of overloading this one.
const baseApplication = (
  interviewStatus: "PENDING" | "CONFIRMED" | null,
): ReviewApplicationContext =>
  ({
    id: "app-1",
    talent: { userId: TALENT_USER_ID, user: { name: "Jane Talent" } },
    job: {
      title: "Senior Backend Engineer",
      employer: { userId: EMPLOYER_USER_ID, companyName: "Acme Corp" },
    },
    interview: interviewStatus
      ? {
          status: interviewStatus,
          confirmedSlot: interviewStatus === "CONFIRMED" ? PAST_SLOT : null,
        }
      : null,
  }) as unknown as ReviewApplicationContext;

const makeService = (repoOverrides: Partial<ReviewsRepository> = {}) => {
  const repo = {
    findApplicationForReview: jest.fn(),
    findByReviewerAndApplication: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    findForRevieweeWithAggregate: jest.fn(),
    ...repoOverrides,
  } as unknown as ReviewsRepository;
  return { service: new ReviewsService(repo), repo };
};

describe("ReviewsService.getEligibility", () => {
  it("throws APPLICATION_NOT_FOUND when the application doesn't exist", async () => {
    const { service } = makeService({
      findApplicationForReview: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .getEligibility(TALENT_USER_ID, "app-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.APPLICATION_NOT_FOUND,
    });
  });

  it("throws APPLICATION_NOT_FOUND (not 403) for a user uninvolved in the application", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
    });

    const error = await service
      .getEligibility("some-other-user", "app-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
  });

  it("is not eligible when no interview has ever been proposed", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication(null)),
    });

    const result = await service.getEligibility(TALENT_USER_ID, "app-1");

    expect(result).toEqual({
      eligible: false,
      reason: "NO_INTERVIEW",
      direction: null,
      revieweeId: null,
      alreadyReviewed: false,
    });
  });

  it("is not eligible when the interview is only PENDING, not CONFIRMED", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("PENDING")),
    });

    const result = await service.getEligibility(TALENT_USER_ID, "app-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("INTERVIEW_NOT_CONFIRMED");
  });

  it("is not eligible when CONFIRMED but the slot hasn't happened yet", async () => {
    const upcomingInterview = {
      ...baseApplication("CONFIRMED"),
      interview: { status: "CONFIRMED", confirmedSlot: FUTURE_SLOT },
    } as ReviewApplicationContext;
    const { service } = makeService({
      findApplicationForReview: jest.fn().mockResolvedValue(upcomingInterview),
    });

    const result = await service.getEligibility(TALENT_USER_ID, "app-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("INTERVIEW_NOT_YET_HELD");
  });

  it("is eligible for the talent, with direction TALENT_TO_EMPLOYER, once the interview is CONFIRMED", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
    });

    const result = await service.getEligibility(TALENT_USER_ID, "app-1");

    expect(result).toEqual({
      eligible: true,
      reason: null,
      direction: "TALENT_TO_EMPLOYER",
      revieweeId: EMPLOYER_USER_ID,
      alreadyReviewed: false,
    });
  });

  it("is eligible for the employer, with direction EMPLOYER_TO_TALENT, once the interview is CONFIRMED", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
    });

    const result = await service.getEligibility(EMPLOYER_USER_ID, "app-1");

    expect(result).toEqual({
      eligible: true,
      reason: null,
      direction: "EMPLOYER_TO_TALENT",
      revieweeId: TALENT_USER_ID,
      alreadyReviewed: false,
    });
  });

  it("reports alreadyReviewed and eligible:false once this caller has already reviewed", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
      findByReviewerAndApplication: jest
        .fn()
        .mockResolvedValue({ id: "existing-review" }),
    });

    const result = await service.getEligibility(TALENT_USER_ID, "app-1");

    expect(result.eligible).toBe(false);
    expect(result.alreadyReviewed).toBe(true);
    expect(result.reason).toBe("ALREADY_REVIEWED");
  });
});

// PB70: GET /reviews/eligibility?partnerId=…
describe("ReviewsService.getEligibilityForPartner", () => {
  const partnerApp = (
    id: string,
    interview: { status: string; confirmedSlot: Date | null } | null,
  ) => ({
    id,
    talent: { userId: TALENT_USER_ID },
    job: { employer: { userId: EMPLOYER_USER_ID } },
    interview,
  });

  it("is not eligible, with NO_INTERVIEW, when the two never interacted", async () => {
    const { service } = makeService({
      findApplicationsBetween: jest.fn().mockResolvedValue([]),
    });

    const result = await service.getEligibilityForPartner(TALENT_USER_ID, {
      partnerId: EMPLOYER_USER_ID,
    });

    expect(result).toMatchObject({
      eligible: false,
      reason: "NO_INTERVIEW",
      applicationId: null,
    });
  });

  it("is not eligible, with INTERVIEW_NOT_YET_HELD, while the confirmed interview is still upcoming", async () => {
    const { service } = makeService({
      findApplicationsBetween: jest.fn().mockResolvedValue([
        partnerApp("app-1", {
          status: "CONFIRMED",
          confirmedSlot: FUTURE_SLOT,
        }),
      ]),
    });

    const result = await service.getEligibilityForPartner(TALENT_USER_ID, {
      partnerId: EMPLOYER_USER_ID,
    });

    expect(result).toMatchObject({
      eligible: false,
      reason: "INTERVIEW_NOT_YET_HELD",
    });
  });

  it("is eligible on the completed, not-yet-reviewed interaction", async () => {
    const { service } = makeService({
      findApplicationsBetween: jest.fn().mockResolvedValue([
        partnerApp("app-old", {
          status: "CONFIRMED",
          confirmedSlot: PAST_SLOT,
        }),
        partnerApp("app-new", {
          status: "CONFIRMED",
          confirmedSlot: PAST_SLOT,
        }),
      ]),
      findReviewedApplicationIds: jest
        .fn()
        .mockResolvedValue([{ applicationId: "app-old" }]),
    });

    const result = await service.getEligibilityForPartner(EMPLOYER_USER_ID, {
      partnerId: TALENT_USER_ID,
    });

    expect(result).toEqual({
      eligible: true,
      reason: null,
      applicationId: "app-new",
      direction: "EMPLOYER_TO_TALENT",
      revieweeId: TALENT_USER_ID,
      alreadyReviewed: false,
    });
  });

  it("reports ALREADY_REVIEWED once every completed interaction is reviewed", async () => {
    const { service } = makeService({
      findApplicationsBetween: jest.fn().mockResolvedValue([
        partnerApp("app-1", {
          status: "CONFIRMED",
          confirmedSlot: PAST_SLOT,
        }),
      ]),
      findReviewedApplicationIds: jest
        .fn()
        .mockResolvedValue([{ applicationId: "app-1" }]),
    });

    const result = await service.getEligibilityForPartner(TALENT_USER_ID, {
      partnerId: EMPLOYER_USER_ID,
    });

    expect(result).toMatchObject({
      eligible: false,
      reason: "ALREADY_REVIEWED",
      alreadyReviewed: true,
      applicationId: null,
    });
  });

  it("never treats the caller as their own partner", async () => {
    const findApplicationsBetween = jest.fn();
    const { service } = makeService({ findApplicationsBetween });

    const result = await service.getEligibilityForPartner(TALENT_USER_ID, {
      partnerId: TALENT_USER_ID,
    });

    expect(findApplicationsBetween).not.toHaveBeenCalled();
    expect(result.eligible).toBe(false);
  });
});

describe("ReviewsService.create", () => {
  const dto = {
    applicationId: "app-1",
    overallRating: 5,
    title: "Smooth process",
    comment: "Clear communication at every step.",
  };

  it("throws APPLICATION_NOT_FOUND for a user uninvolved in the application", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
    });

    const error = await service
      .create("some-other-user", dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
  });

  it("throws REVIEW_NOT_ELIGIBLE when the interview hasn't been confirmed", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("PENDING")),
    });

    const error = await service
      .create(TALENT_USER_ID, dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.REVIEW_NOT_ELIGIBLE,
    });
  });

  it("rejects reliabilityRating on a TALENT_TO_EMPLOYER review", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
    });

    const error = await service
      .create(TALENT_USER_ID, { ...dto, reliabilityRating: 5 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.REVIEW_INVALID_CATEGORY,
    });
  });

  it("rejects interviewProcessRating on an EMPLOYER_TO_TALENT review", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
    });

    const error = await service
      .create(EMPLOYER_USER_ID, { ...dto, interviewProcessRating: 4 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.REVIEW_INVALID_CATEGORY,
    });
  });

  it("rejects a self-review when reviewer and reviewee resolve to the same user", async () => {
    const sameUserApplication = baseApplication("CONFIRMED");
    // A single account holding both the talent and employer profile on this
    // one application — the structural edge case the self-review guard
    // exists for even though talent/employer are normally different people.
    (sameUserApplication.job.employer as { userId: string }).userId =
      TALENT_USER_ID;
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(sameUserApplication),
    });

    const error = await service
      .create(TALENT_USER_ID, dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.REVIEW_SELF_NOT_ALLOWED,
    });
  });

  it("creates a review with the server-derived direction and revieweeId, ignoring any client-provided ones", async () => {
    const create = jest.fn().mockResolvedValue({ id: "review-1" });
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
      create,
    });

    await service.create(TALENT_USER_ID, {
      ...dto,
      communicationRating: 5,
      professionalismRating: 4,
      interviewProcessRating: 5,
      comment: "Great process, very well organised.",
    });

    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      direction: "TALENT_TO_EMPLOYER",
      reviewerId: TALENT_USER_ID,
      revieweeId: EMPLOYER_USER_ID,
      overallRating: 5,
      communicationRating: 5,
      professionalismRating: 4,
      interviewProcessRating: 5,
      reliabilityRating: undefined,
      title: "Smooth process",
      comment: "Great process, very well organised.",
    });
  });

  // PB71 BR2 — replaces "creates a review without a comment (optional)",
  // which PB71 AC3 no longer allows.
  it.each([
    ["comment", { comment: "The interviewer was a total asshole to me." }],
    ["title", { title: "Đồ chó" }],
    [
      "Vietnamese abbreviation",
      { comment: "Quy trình như vcl, không chuyên nghiệp." },
    ],
  ])(
    "rejects blocked language in the %s with REVIEW_CONTENT_REJECTED",
    async (_label, override) => {
      const create = jest.fn();
      const { service } = makeService({
        findApplicationForReview: jest
          .fn()
          .mockResolvedValue(baseApplication("CONFIRMED")),
        create,
      });

      const error = await service
        .create(TALENT_USER_ID, { ...dto, ...override })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestApiException);
      expect((error as BadRequestApiException).getResponse()).toMatchObject({
        code: ErrorCode.REVIEW_CONTENT_REJECTED,
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("does not flag ordinary words that merely contain a blocked term", async () => {
    const create = jest.fn().mockResolvedValue({ id: "review-1" });
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
      create,
    });

    await service.create(TALENT_USER_ID, {
      ...dto,
      title: "Dickens fan, Scunthorpe office",
      comment: "Du lịch, đúng giờ, rất chuyên nghiệp và thân thiện.",
    });

    expect(create).toHaveBeenCalled();
  });

  it("allows the employer to review the talent independently of the talent's own review", async () => {
    const create = jest.fn().mockResolvedValue({ id: "review-2" });
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
      create,
    });

    await service.create(EMPLOYER_USER_ID, {
      ...dto,
      reliabilityRating: 5,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "EMPLOYER_TO_TALENT",
        reviewerId: EMPLOYER_USER_ID,
        revieweeId: TALENT_USER_ID,
        reliabilityRating: 5,
      }),
    );
  });

  it("allows the same reviewer to review across two different applications (not blocked by reviewer+reviewee)", async () => {
    const create = jest.fn().mockResolvedValue({ id: "review-3" });
    const secondApplication = { ...baseApplication("CONFIRMED"), id: "app-2" };
    const { service } = makeService({
      findApplicationForReview: jest.fn().mockResolvedValue(secondApplication),
      create,
    });

    await service.create(TALENT_USER_ID, {
      ...dto,
      applicationId: "app-2",
      overallRating: 4,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "app-2" }),
    );
  });

  it("converts a unique-constraint race into REVIEW_ALREADY_EXISTS", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "5.22.0",
    });
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
      create: jest.fn().mockRejectedValue(p2002),
    });

    const error = await service
      .create(TALENT_USER_ID, dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.REVIEW_ALREADY_EXISTS,
    });
  });

  it("rethrows an unrelated repository error", async () => {
    const { service } = makeService({
      findApplicationForReview: jest
        .fn()
        .mockResolvedValue(baseApplication("CONFIRMED")),
      create: jest.fn().mockRejectedValue(new Error("db down")),
    });

    await expect(service.create(TALENT_USER_ID, dto)).rejects.toThrow(
      "db down",
    );
  });
});

describe("ReviewsService.listForUser", () => {
  it("maps the repository aggregate into the documented response shape", async () => {
    const { service, repo } = makeService({
      findForRevieweeWithAggregate: jest.fn().mockResolvedValue({
        reviews: [{ id: "review-1" }],
        total: 24,
        filteredTotal: 24,
        distribution: { 1: 0, 2: 1, 3: 2, 4: 6, 5: 15 },
        avg: {
          overallRating: 4.8,
          communicationRating: 4.9,
          professionalismRating: 4.8,
          interviewProcessRating: 4.6,
          reliabilityRating: null,
        },
      }),
    });

    const result = await service.listForUser(EMPLOYER_USER_ID, {
      page: 1,
      limit: 20,
      sort: "newest",
    });

    expect(repo.findForRevieweeWithAggregate).toHaveBeenCalledWith(
      EMPLOYER_USER_ID,
      0,
      20,
      { rating: undefined, sort: "newest" },
    );
    expect(result).toEqual({
      averageRating: 4.8,
      totalReviews: 24,
      distribution: { 1: 0, 2: 1, 3: 2, 4: 6, 5: 15 },
      ratings: {
        communication: 4.9,
        professionalism: 4.8,
        interviewProcess: 4.6,
        reliability: null,
      },
      reviews: [{ id: "review-1" }],
      pagination: { page: 1, limit: 20, total: 24, pages: 2 },
    });
  });

  // PB72 AC3: a star filter narrows the list and its pagination, never the
  // aggregate figures above it.
  it("passes the star filter through and paginates on the filtered total", async () => {
    const { service, repo } = makeService({
      findForRevieweeWithAggregate: jest.fn().mockResolvedValue({
        reviews: [],
        total: 24,
        filteredTotal: 6,
        distribution: { 1: 0, 2: 1, 3: 2, 4: 6, 5: 15 },
        avg: {
          overallRating: 4.5,
          communicationRating: null,
          professionalismRating: null,
          interviewProcessRating: null,
          reliabilityRating: null,
        },
      }),
    });

    const result = await service.listForUser(EMPLOYER_USER_ID, {
      page: 1,
      limit: 5,
      rating: 4,
      sort: "oldest",
    });

    expect(repo.findForRevieweeWithAggregate).toHaveBeenCalledWith(
      EMPLOYER_USER_ID,
      0,
      5,
      { rating: 4, sort: "oldest" },
    );
    expect(result.totalReviews).toBe(24);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 5,
      total: 6,
      pages: 2,
    });
  });
});
