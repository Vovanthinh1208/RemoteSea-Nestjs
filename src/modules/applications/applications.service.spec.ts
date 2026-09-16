import { Prisma } from "@prisma/client";
import { ApplicationsService } from "./applications.service";
import type { ApplicationsRepository } from "./applications.repository";
import type { ApplicationWithJob, BackloggedApplication } from "./interfaces";
import type { EmailService } from "@/common/services/email.service";
import type { NotificationsService } from "@/modules/notifications/notifications.service";
import { ConflictApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const makeService = (
  repoOverrides: Partial<ApplicationsRepository> = {},
  emailOverrides: Partial<EmailService> = {},
) => {
  const repo = { ...repoOverrides } as unknown as ApplicationsRepository;
  const email = { ...emailOverrides } as unknown as EmailService;
  const notifications = { create: jest.fn() } as unknown as NotificationsService;
  return new ApplicationsService(repo, email, notifications, {} as never);
};

describe("ApplicationsService.findAllForUser", () => {
  it("returns an empty paginated envelope when the user has no talent profile", async () => {
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue(null),
    });

    const result = await service.findAllForUser("user-1", 1, 20);
    expect(result).toEqual({
      applications: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });
  });

  it("converts page/limit to skip and wraps the result in a pagination envelope", async () => {
    const rows = [{ id: "app-1" } as unknown as ApplicationWithJob];
    const findByTalentId = jest.fn().mockResolvedValue([rows, 12]);
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue({ id: "talent-1" }),
      findByTalentId,
    });

    const result = await service.findAllForUser("user-1", 2, 5);

    expect(findByTalentId).toHaveBeenCalledWith("talent-1", 5, 5);
    expect(result).toEqual({
      applications: rows,
      pagination: { page: 2, limit: 5, total: 12, pages: 3 },
    });
  });
});

describe("ApplicationsService.getStatusCounts", () => {
  it("returns all-zero counts when the user has no talent profile", async () => {
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue(null),
    });

    const result = await service.getStatusCounts("user-1");
    expect(result.total).toBe(0);
    expect(result.byStatus.PENDING).toBe(0);
  });

  it("shapes the repository's groupBy rows into totals", async () => {
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue({ id: "talent-1" }),
      getStatusCountsByTalentId: jest
        .fn()
        .mockResolvedValue([{ status: "OFFERED", count: 4 }]),
    });

    const result = await service.getStatusCounts("user-1");
    expect(result.total).toBe(4);
    expect(result.byStatus.OFFERED).toBe(4);
  });
});

describe("ApplicationsService.apply", () => {
  it("maps a P2002 race on the unique (jobId, talentId) constraint to ALREADY_APPLIED, not a generic conflict", async () => {
    const service = makeService({
      findTalentWithUserName: jest
        .fn()
        .mockResolvedValue({ id: "talent-1", user: { name: "Talent" } }),
      // Fast path sees no existing row — a concurrent duplicate request
      // still races past this and hits the DB constraint below.
      findByJobAndTalent: jest.fn().mockResolvedValue(null),
      createAndIncrementApplyCount: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "5.22.0",
        }),
      ),
    });

    const error = await service
      .apply("user-1", { jobId: "job-1" } as never)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ALREADY_APPLIED,
    });
  });
});

const makeBacklogged = (
  overrides: Partial<BackloggedApplication> = {},
): BackloggedApplication =>
  ({
    id: "app-1",
    status: "PENDING",
    appliedAt: new Date("2026-08-01T00:00:00.000Z"),
    talent: { user: { name: "Jane Doe" } },
    job: {
      title: "Backend Engineer",
      employer: {
        id: "employer-1",
        companyName: "Acme",
        user: { email: "acme@example.com" },
      },
    },
    ...overrides,
  }) as BackloggedApplication;

describe("ApplicationsService.dispatchBacklogReminders", () => {
  it("skips a run that starts while a previous one on this instance is still in progress", async () => {
    let resolveFindBacklogged!: (rows: BackloggedApplication[]) => void;
    const findBacklogged = jest.fn(
      () =>
        new Promise<BackloggedApplication[]>((resolve) => {
          resolveFindBacklogged = resolve;
        }),
    );
    const service = makeService({ findBacklogged });

    const first = service.dispatchBacklogReminders();
    const secondResult = await service.dispatchBacklogReminders();

    expect(secondResult).toEqual({ processed: 0, sent: 0 });
    expect(findBacklogged).toHaveBeenCalledTimes(1);

    resolveFindBacklogged([]);
    await expect(first).resolves.toEqual({ processed: 0, sent: 0 });
  });

  it("emails one digest per employer and stamps lastReminderSentAt only for the applications that were sent", async () => {
    const findBacklogged = jest
      .fn()
      .mockResolvedValue([makeBacklogged({ id: "app-1" })]);
    const markRemindersSent = jest.fn().mockResolvedValue(undefined);
    const sendBacklogReminderEmail = jest.fn().mockResolvedValue(undefined);
    const service = makeService(
      { findBacklogged, markRemindersSent },
      { sendBacklogReminderEmail },
    );

    const result = await service.dispatchBacklogReminders();

    expect(sendBacklogReminderEmail).toHaveBeenCalledWith(
      "acme@example.com",
      expect.arrayContaining([
        expect.objectContaining({ jobTitle: "Backend Engineer" }),
      ]),
    );
    expect(markRemindersSent).toHaveBeenCalledWith(["app-1"]);
    expect(result).toEqual({ processed: 1, sent: 1 });
  });

  it("a failed send for one employer doesn't block the others or mark that one as reminded", async () => {
    const findBacklogged = jest.fn().mockResolvedValue([
      makeBacklogged({ id: "app-1" }),
      makeBacklogged({
        id: "app-2",
        job: {
          title: "Designer",
          employer: {
            id: "employer-2",
            companyName: "Beta",
            user: { email: "beta@example.com" },
          },
        },
      }),
    ]);
    const markRemindersSent = jest.fn().mockResolvedValue(undefined);
    const sendBacklogReminderEmail = jest
      .fn()
      .mockRejectedValueOnce(new Error("Resend down"))
      .mockResolvedValueOnce(undefined);
    const service = makeService(
      { findBacklogged, markRemindersSent },
      { sendBacklogReminderEmail },
    );

    const result = await service.dispatchBacklogReminders();

    expect(result).toEqual({ processed: 2, sent: 1 });
    expect(markRemindersSent).toHaveBeenCalledTimes(1);
    expect(markRemindersSent).not.toHaveBeenCalledWith(["app-1"]);
  });
});
