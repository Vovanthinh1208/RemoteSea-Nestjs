import { Prisma } from "@prisma/client";
import { InvitationsService } from "./invitations.service";
import type { InvitationsRepository } from "./invitations.repository";
import type { InvitationOwner } from "./interfaces";
import {
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

const emailService = {
  sendJobInvitationEmail: jest.fn().mockResolvedValue(undefined),
  sendApplicationReceivedEmail: jest.fn().mockResolvedValue(undefined),
};

const notificationsService = {
  create: jest.fn().mockResolvedValue(undefined),
};

const makeService = (repoOverrides: Partial<InvitationsRepository> = {}) => {
  const repo = { ...repoOverrides } as unknown as InvitationsRepository;
  return {
    service: new InvitationsService(
      repo,
      emailService as never,
      notificationsService as never,
    ),
    repo,
  };
};

const employerUser: AuthenticatedUser = {
  id: "employer-user-1",
  role: "EMPLOYER",
} as AuthenticatedUser;

describe("InvitationsService.send", () => {
  it("rejects when the job doesn't belong to the caller's employer profile", async () => {
    const { service } = makeService({
      findEmployerProfileByUserId: jest
        .fn()
        .mockResolvedValue({ id: "employer-1", companyName: "Acme" }),
      findJobForInvite: jest.fn().mockResolvedValue({
        id: "job-1",
        title: "Engineer",
        status: "ACTIVE",
        employerId: "someone-else",
      }),
    });

    const error = await service
      .send(employerUser, { jobId: "job-1", talentId: "talent-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_ACCESS_DENIED,
    });
  });

  it("maps a P2002 race on the unique (jobId, talentId) constraint to ALREADY_INVITED", async () => {
    const { service } = makeService({
      findEmployerProfileByUserId: jest
        .fn()
        .mockResolvedValue({ id: "employer-1", companyName: "Acme" }),
      findJobForInvite: jest.fn().mockResolvedValue({
        id: "job-1",
        title: "Engineer",
        status: "ACTIVE",
        employerId: "employer-1",
      }),
      findTalentWithUser: jest.fn().mockResolvedValue({
        id: "talent-1",
        userId: "talent-user-1",
        user: { email: "t@example.com", name: "Talent" },
      }),
      // Fast path sees no existing row — a concurrent duplicate request
      // still races past this and hits the DB constraint below.
      findByJobAndTalent: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "5.22.0",
        }),
      ),
    });

    const error = await service
      .send(employerUser, { jobId: "job-1", talentId: "talent-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ALREADY_INVITED,
    });
  });

  it("skips the notification email when employerMessages is disabled but still creates the invitation and the in-app notification", async () => {
    const create = jest.fn().mockResolvedValue({ id: "inv-1" });
    const { service } = makeService({
      findEmployerProfileByUserId: jest
        .fn()
        .mockResolvedValue({ id: "employer-1", companyName: "Acme" }),
      findJobForInvite: jest.fn().mockResolvedValue({
        id: "job-1",
        title: "Engineer",
        slug: "engineer-a1b2c3",
        status: "ACTIVE",
        employerId: "employer-1",
      }),
      findTalentWithUser: jest.fn().mockResolvedValue({
        id: "talent-1",
        userId: "talent-user-1",
        user: { email: "t@example.com", name: "Talent" },
      }),
      findByJobAndTalent: jest.fn().mockResolvedValue(null),
      create,
      employerMessagesEnabled: jest.fn().mockResolvedValue(false),
    });

    await service.send(employerUser, { jobId: "job-1", talentId: "talent-1" });

    expect(create).toHaveBeenCalled();
    expect(emailService.sendJobInvitationEmail).not.toHaveBeenCalled();
    // In-app notifications are a separate, always-on channel — the email
    // toggle above must not suppress this.
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "talent-user-1",
      type: "INVITATION_RECEIVED",
      title: "Acme invited you to apply",
      body: "You've been invited to apply for Engineer.",
      link: "/jobs/engineer-a1b2c3",
    });
  });
});

describe("InvitationsService.respond", () => {
  const pendingInvitation: InvitationOwner = {
    id: "inv-1",
    jobId: "job-1",
    talentId: "talent-1",
    status: "PENDING",
    talent: { userId: "talent-user-1", user: { name: "Talent" } },
  } as InvitationOwner;

  it("rejects when the caller doesn't own the invitation", async () => {
    const { service } = makeService({
      findOwnerById: jest.fn().mockResolvedValue(pendingInvitation),
    });

    const error = await service
      .respond("someone-else", "inv-1", { action: "DECLINE" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVITATION_ACCESS_DENIED,
    });
  });

  it("rejects responding to an invitation that's no longer PENDING", async () => {
    const { service } = makeService({
      findOwnerById: jest
        .fn()
        .mockResolvedValue({ ...pendingInvitation, status: "DECLINED" }),
    });

    const error = await service
      .respond("talent-user-1", "inv-1", { action: "ACCEPT" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVITATION_ALREADY_RESPONDED,
    });
  });

  it("declining just updates status, without creating an Application", async () => {
    const decline = jest.fn().mockResolvedValue(undefined);
    const accept = jest.fn();
    const { service } = makeService({
      findOwnerById: jest.fn().mockResolvedValue(pendingInvitation),
      decline,
      accept,
    });

    const result = await service.respond("talent-user-1", "inv-1", {
      action: "DECLINE",
    });

    expect(result).toEqual({ status: "DECLINED" });
    expect(decline).toHaveBeenCalledWith("inv-1");
    expect(accept).not.toHaveBeenCalled();
  });

  it("accepting creates a real Application and notifies the employer", async () => {
    const accept = jest.fn().mockResolvedValue({
      application: { id: "app-1" },
      job: {
        title: "Engineer",
        employer: { user: { email: "employer@example.com" } },
      },
    });
    const { service } = makeService({
      findOwnerById: jest.fn().mockResolvedValue(pendingInvitation),
      accept,
    });

    const result = await service.respond("talent-user-1", "inv-1", {
      action: "ACCEPT",
    });

    expect(result).toEqual({ status: "ACCEPTED" });
    expect(accept).toHaveBeenCalledWith(pendingInvitation);
    expect(emailService.sendApplicationReceivedEmail).toHaveBeenCalledWith(
      "employer@example.com",
      "Engineer",
      "Talent",
    );
  });
});
