import { InterviewsService } from "./interviews.service";
import type { InterviewsRepository } from "./interviews.repository";
import type { ApplicationParties } from "./interfaces";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const notificationsService = {
  create: jest.fn().mockResolvedValue(undefined),
};

const companyMembershipService = {
  resolveMembership: jest.fn().mockResolvedValue(null),
};

const makeService = (
  repoOverrides: Partial<InterviewsRepository> = {},
  companyMembershipOverrides: Record<string, jest.Mock> = {},
) => {
  const repo = { ...repoOverrides } as unknown as InterviewsRepository;
  const company = {
    ...companyMembershipService,
    ...companyMembershipOverrides,
  };
  return {
    service: new InterviewsService(
      repo,
      notificationsService as never,
      company as never,
    ),
    repo,
    companyMembershipService: company,
  };
};

const parties: ApplicationParties = {
  id: "app-1",
  status: "INTERVIEW",
  talent: { userId: "talent-user-1", user: { name: "Talent One" } },
  job: {
    title: "Backend Engineer",
    employerId: "company-1",
    employer: { userId: "employer-user-1", companyName: "Acme Inc" },
  },
};

const futureSlot = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const pastSlot = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  notificationsService.create.mockClear();
});

describe("InterviewsService.propose", () => {
  it("rejects when the application isn't at the INTERVIEW stage", async () => {
    const { service } = makeService();

    const error = await service
      .propose(
        { ...parties, status: "SHORTLISTED" },
        {
          durationMinutes: 30,
          proposedSlots: [futureSlot().toISOString()],
        },
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.APPLICATION_NOT_AT_INTERVIEW_STAGE,
    });
  });

  it("rejects a proposed slot in the past", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .propose(parties, {
        durationMinutes: 30,
        proposedSlots: [pastSlot().toISOString()],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_INTERVIEW_SLOT,
    });
  });

  it("rejects re-proposing onto an already-confirmed interview", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "CONFIRMED",
      }),
    });

    const error = await service
      .propose(parties, {
        durationMinutes: 30,
        proposedSlots: [futureSlot().toISOString()],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_ALREADY_CONFIRMED,
    });
  });

  it("upserts and notifies the talent on success", async () => {
    const slot = futureSlot();
    const upsertPending = jest.fn().mockResolvedValue({
      id: "intv-1",
      status: "PENDING",
      proposedSlots: [slot],
    });
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
      upsertPending,
    });

    await service.propose(parties, {
      durationMinutes: 45,
      proposedSlots: [slot.toISOString()],
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });

    expect(upsertPending).toHaveBeenCalledWith({
      applicationId: "app-1",
      durationMinutes: 45,
      proposedSlots: [slot],
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "talent-user-1",
      type: "INTERVIEW_PROPOSED",
      title: "Acme Inc proposed interview times",
      body: "1 option(s) for a 45-min interview for Backend Engineer.",
      link: "/applications/app-1/interview",
    });
  });
});

describe("InterviewsService.confirm", () => {
  it("throws INTERVIEW_NOT_FOUND when nothing has been proposed yet", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .confirm(parties, { slot: futureSlot().toISOString() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_NOT_FOUND,
    });
  });

  it("rejects a slot that wasn't one of the proposed options", async () => {
    const proposed = futureSlot();
    const somethingElse = new Date(proposed.getTime() + 60_000);
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        proposedSlots: [proposed],
      }),
    });

    const error = await service
      .confirm(parties, { slot: somethingElse.toISOString() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_INTERVIEW_SLOT,
    });
  });

  it("throws INTERVIEW_ALREADY_CONFIRMED when the CAS write loses the race", async () => {
    const slot = futureSlot();
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        proposedSlots: [slot],
      }),
      confirmSlot: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .confirm(parties, { slot: slot.toISOString() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_ALREADY_CONFIRMED,
    });
  });

  it("confirms the slot and notifies the employer on success", async () => {
    const slot = futureSlot();
    const confirmSlot = jest.fn().mockResolvedValue({
      id: "intv-1",
      status: "CONFIRMED",
      confirmedSlot: slot,
    });
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        proposedSlots: [slot],
      }),
      confirmSlot,
    });

    const result = await service.confirm(parties, { slot: slot.toISOString() });

    expect(confirmSlot).toHaveBeenCalledWith("app-1", slot);
    expect(result.status).toBe("CONFIRMED");
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "employer-user-1",
      type: "INTERVIEW_CONFIRMED",
      title: "Interview confirmed",
      body: "Talent One confirmed the interview for Backend Engineer.",
      link: "/applications/app-1/interview",
    });
  });
});

describe("InterviewsService.isComplete", () => {
  it("is false when there's no interview for the application", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest.fn().mockResolvedValue(null),
    });

    expect(await service.isComplete("app-1")).toBe(false);
  });

  it("is false while still PENDING", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest
        .fn()
        .mockResolvedValue({ status: "PENDING", confirmedSlot: null }),
    });

    expect(await service.isComplete("app-1")).toBe(false);
  });

  it("is false when CONFIRMED but the slot hasn't happened yet", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest.fn().mockResolvedValue({
        status: "CONFIRMED",
        confirmedSlot: futureSlot(),
      }),
    });

    expect(await service.isComplete("app-1")).toBe(false);
  });

  it("is true once CONFIRMED and the slot has passed", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest.fn().mockResolvedValue({
        status: "CONFIRMED",
        confirmedSlot: pastSlot(),
      }),
    });

    expect(await service.isComplete("app-1")).toBe(true);
  });
});
