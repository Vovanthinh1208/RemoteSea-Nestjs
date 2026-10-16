import { TalentService } from "./talent.service";
import {
  BadRequestApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { TalentRepository } from "./talent.repository";
import type { UploadsService } from "@/modules/uploads/uploads.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import type { ProfileViewsService } from "@/modules/profile-views/profile-views.service";
import type { ApplicationsService } from "@/modules/applications/applications.service";
import type { SavedService } from "@/modules/saved/saved.service";
import type { AlertsService } from "@/modules/alerts/alerts.service";
import type { InvitationsService } from "@/modules/invitations/invitations.service";

const makeService = (
  repoOverrides: Partial<TalentRepository> = {},
  profileViewsOverrides: Partial<ProfileViewsService> = {},
  crossModuleOverrides: {
    applicationsService?: Partial<ApplicationsService>;
    savedService?: Partial<SavedService>;
    alertsService?: Partial<AlertsService>;
    invitationsService?: Partial<InvitationsService>;
  } = {},
) => {
  const repo = {
    findUserName: jest.fn().mockResolvedValue({ name: "Ada" }),
    findSalaryAndResumeByUserId: jest.fn().mockResolvedValue(null),
    upsertProfileWithSkills: jest.fn().mockResolvedValue({ id: "profile-1" }),
    findByIdWithSkills: jest.fn().mockResolvedValue({ id: "profile-1" }),
    findTalentIdByUserId: jest.fn().mockResolvedValue({ id: "profile-1" }),
    isVerifiedEmployer: jest.fn().mockResolvedValue(false),
    search: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    ...repoOverrides,
  } as unknown as TalentRepository;
  const config = { get: jest.fn().mockReturnValue("https://cdn.example.com") };
  const emailService = {
    sendTalentVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
  const profileViewsService = {
    recordView: jest.fn().mockResolvedValue(undefined),
    getAnalytics: jest
      .fn()
      .mockResolvedValue({ totalViews: 0, uniqueViewers: 0 }),
    ...profileViewsOverrides,
  } as unknown as ProfileViewsService;
  const applicationsService = {
    findAllForUser: jest
      .fn()
      .mockResolvedValue({ applications: [], pagination: {} }),
    getStatusCounts: jest.fn().mockResolvedValue({ total: 0, byStatus: {} }),
    ...crossModuleOverrides.applicationsService,
  } as unknown as ApplicationsService;
  const savedService = {
    findJobIdsForUser: jest.fn().mockResolvedValue([]),
    ...crossModuleOverrides.savedService,
  } as unknown as SavedService;
  const alertsService = {
    listForUser: jest.fn().mockResolvedValue([]),
    ...crossModuleOverrides.alertsService,
  } as unknown as AlertsService;
  const invitationsService = {
    listForTalent: jest.fn().mockResolvedValue([]),
    ...crossModuleOverrides.invitationsService,
  } as unknown as InvitationsService;
  return {
    service: new TalentService(
      repo,
      config as never,
      {} as UploadsService,
      emailService as never,
      profileViewsService,
      applicationsService,
      savedService,
      alertsService,
      invitationsService,
    ),
    repo,
    emailService,
    profileViewsService,
    applicationsService,
    savedService,
    alertsService,
    invitationsService,
  };
};

const viewer: AuthenticatedUser = {
  id: "employer-1",
  role: "EMPLOYER",
} as AuthenticatedUser;

describe("TalentService.search", () => {
  it("only lets a verified employer's where clause include VERIFIED_EMPLOYERS profiles", async () => {
    const { service, repo } = makeService({
      isVerifiedEmployer: jest.fn().mockResolvedValue(true),
    });

    await service.search(viewer, { page: 1, limit: 20 });

    expect(repo.isVerifiedEmployer).toHaveBeenCalledWith(viewer.id);
    const whereArg = (repo.search as jest.Mock).mock.calls[0][0];
    expect(whereArg).toMatchObject({
      isOpenToWork: true,
      visibility: { in: ["PUBLIC", "VERIFIED_EMPLOYERS"] },
    });
  });

  it("restricts an unverified employer's where clause to PUBLIC + isOpenToWork", async () => {
    const { service, repo } = makeService({
      isVerifiedEmployer: jest.fn().mockResolvedValue(false),
    });

    await service.search(viewer, { page: 1, limit: 20 });

    const whereArg = (repo.search as jest.Mock).mock.calls[0][0];
    expect(whereArg).toMatchObject({
      isOpenToWork: true,
      visibility: "PUBLIC",
    });
  });

  it("returns pagination built from page/limit/total", async () => {
    const { service } = makeService({
      search: jest.fn().mockResolvedValue([{ id: "t1" }]),
      count: jest.fn().mockResolvedValue(1),
    });

    const result = await service.search(viewer, { page: 1, limit: 20 });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    });
    expect(result.talents).toEqual([{ id: "t1" }]);
  });
});

describe("TalentService.upsertProfile", () => {
  it("reads existing salary/resume via the narrow query, not a full-profile fetch", async () => {
    const findSalaryAndResumeByUserId = jest.fn().mockResolvedValue({
      desiredSalaryMin: 1000,
      desiredSalaryMax: 2000,
      resumeUrl: null,
    });
    const { service, repo } = makeService({ findSalaryAndResumeByUserId });

    await service.upsertProfile("user-1", { headline: "Engineer" });

    expect(findSalaryAndResumeByUserId).toHaveBeenCalledWith("user-1");
    // findByUserId (the full skills+skill+user join) must not be called at all here.
    expect(
      (repo as unknown as { findByUserId?: unknown }).findByUserId,
    ).toBeUndefined();
  });

  it("validates the effective salary range using the narrow query's existing values", async () => {
    const { service } = makeService({
      findSalaryAndResumeByUserId: jest.fn().mockResolvedValue({
        desiredSalaryMin: 1000,
        desiredSalaryMax: 2000,
        resumeUrl: null,
      }),
    });

    await expect(
      service.upsertProfile("user-1", { desiredSalaryMax: 500 }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });
});

describe("TalentService.submitVerification", () => {
  it("throws TALENT_PROFILE_NOT_FOUND when the caller has no profile", async () => {
    const { service } = makeService({
      findProfileForVerification: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .submitVerification("user-1", { email: "jane@example.com" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.TALENT_PROFILE_NOT_FOUND,
    });
  });

  it("creates a verification token and emails it — no domain-match check", async () => {
    const createEmailVerification = jest.fn().mockResolvedValue(undefined);
    const { service, emailService } = makeService({
      findProfileForVerification: jest
        .fn()
        .mockResolvedValue({ id: "talent-1" }),
      createEmailVerification,
    });

    await service.submitVerification("user-1", { email: "jane@gmail.com" });

    expect(createEmailVerification).toHaveBeenCalledWith(
      "talent-1",
      "jane@gmail.com",
      expect.any(String),
      expect.any(Date),
    );
    expect(emailService.sendTalentVerificationEmail).toHaveBeenCalledWith(
      "jane@gmail.com",
      expect.any(String),
    );
  });
});

describe("TalentService.confirmVerification", () => {
  it("rejects an unknown token", async () => {
    const { service } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.confirmVerification({ token: "bogus" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects an already-consumed token", async () => {
    const { service } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        talentId: "talent-1",
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 10_000),
      }),
    });

    await expect(
      service.confirmVerification({ token: "used" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("marks the profile FAILED and rejects an expired token", async () => {
    const { service, repo } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        talentId: "talent-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() - 10_000),
      }),
      markVerificationFailed: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.confirmVerification({ token: "expired" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(repo.markVerificationFailed).toHaveBeenCalledWith("talent-1");
  });

  it("consumes a valid token and verifies the profile", async () => {
    const { service, repo } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        talentId: "talent-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
      }),
      consumeEmailVerification: jest.fn().mockResolvedValue(true),
    });

    await service.confirmVerification({ token: "good" });
    expect(repo.consumeEmailVerification).toHaveBeenCalledWith(
      "ver-1",
      "talent-1",
    );
  });

  it("rejects when consumeEmailVerification loses the race (already consumed concurrently)", async () => {
    const { service } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        talentId: "talent-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
      }),
      consumeEmailVerification: jest.fn().mockResolvedValue(false),
    });

    await expect(
      service.confirmVerification({ token: "raced" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });
});

describe("TalentService.getPublicProfile — profile view recording", () => {
  const profile = {
    id: "profile-1",
    userId: "talent-user-1",
    visibility: "PUBLIC",
  };

  it("records a view for an authenticated Employer", async () => {
    const { service, repo, profileViewsService } = makeService({
      findBySlug: jest.fn().mockResolvedValue(profile),
    });

    await service.getPublicProfile("ada", viewer);

    expect(repo.findBySlug).toHaveBeenCalledWith("ada");
    expect(profileViewsService.recordView).toHaveBeenCalledWith(
      viewer,
      "profile-1",
    );
  });

  it("still calls recordView for a Talent viewer, leaving the self/role exclusion to ProfileViewsService", async () => {
    // TalentService itself doesn't decide who counts — it always forwards
    // the viewer, and ProfileViewsService.recordView is what no-ops a
    // non-Employer caller (see that service's own spec). This just proves
    // the hook fires unconditionally rather than silently never firing.
    const talentViewer = {
      id: "talent-user-1",
      role: "TALENT",
    } as AuthenticatedUser;
    const { service, repo, profileViewsService } = makeService({
      findBySlug: jest.fn().mockResolvedValue(profile),
    });

    await service.getPublicProfile("ada", talentViewer);

    expect(repo.findBySlug).toHaveBeenCalledWith("ada");
    expect(profileViewsService.recordView).toHaveBeenCalledWith(
      talentViewer,
      "profile-1",
    );
  });

  it("does not record a view for a gated VERIFIED_EMPLOYERS profile the caller can't see", async () => {
    const { service, profileViewsService } = makeService({
      findBySlug: jest
        .fn()
        .mockResolvedValue({ ...profile, visibility: "VERIFIED_EMPLOYERS" }),
      isVerifiedEmployer: jest.fn().mockResolvedValue(false),
    });

    await expect(
      service.getPublicProfile("ada", viewer),
    ).rejects.toBeInstanceOf(NotFoundApiException);
    expect(profileViewsService.recordView).not.toHaveBeenCalled();
  });
});

describe("TalentService.getProfileViewAnalytics", () => {
  it("returns the caller's own analytics", async () => {
    const { service, repo, profileViewsService } = makeService(
      {},
      {
        getAnalytics: jest
          .fn()
          .mockResolvedValue({ totalViews: 128, uniqueViewers: 47 }),
      },
    );

    const result = await service.getProfileViewAnalytics("talent-user-1");

    expect(repo.findTalentIdByUserId).toHaveBeenCalledWith("talent-user-1");
    expect(profileViewsService.getAnalytics).toHaveBeenCalledWith("profile-1");
    expect(result).toEqual({ totalViews: 128, uniqueViewers: 47 });
  });

  it("returns zero values, not a 404, when the caller has no talent profile yet", async () => {
    const { service, profileViewsService } = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue(null),
    });

    const result = await service.getProfileViewAnalytics("no-profile-user");

    expect(result).toEqual({ totalViews: 0, uniqueViewers: 0 });
    expect(profileViewsService.getAnalytics).not.toHaveBeenCalled();
  });
});

describe("TalentService.getDashboard", () => {
  it("aggregates all eight pieces in one call", async () => {
    const { service, repo } = makeService(
      {
        findByUserId: jest
          .fn()
          .mockResolvedValue({ id: "profile-1", headline: "Engineer" }),
        findRecentStatusEvents: jest.fn().mockResolvedValue([]),
        findRecentMessagesReceived: jest.fn().mockResolvedValue([]),
        findRecentInterviews: jest.fn().mockResolvedValue([]),
        findRecentInvitations: jest.fn().mockResolvedValue([]),
      },
      {
        getAnalytics: jest
          .fn()
          .mockResolvedValue({ totalViews: 5, uniqueViewers: 2 }),
      },
      {
        applicationsService: {
          findAllForUser: jest.fn().mockResolvedValue({
            applications: [{ id: "app-1" }],
            pagination: {},
          }),
          getStatusCounts: jest
            .fn()
            .mockResolvedValue({ total: 1, byStatus: { PENDING: 1 } }),
        },
        savedService: {
          findJobIdsForUser: jest.fn().mockResolvedValue(["job-1"]),
        },
        alertsService: {
          listForUser: jest.fn().mockResolvedValue([{ id: "alert-1" }]),
        },
        invitationsService: {
          listForTalent: jest.fn().mockResolvedValue([{ id: "invite-1" }]),
        },
      },
    );

    const result = await service.getDashboard("talent-user-1");

    expect(repo.findByUserId).toHaveBeenCalledWith("talent-user-1");
    expect(result.profile).toMatchObject({ id: "profile-1" });
    expect(result.applications).toEqual({
      applications: [{ id: "app-1" }],
      pagination: {},
    });
    expect(result.applicationStats).toEqual({
      total: 1,
      byStatus: { PENDING: 1 },
    });
    expect(result.savedJobIds).toEqual(["job-1"]);
    expect(result.profileViewAnalytics).toEqual({
      totalViews: 5,
      uniqueViewers: 2,
    });
    expect(result.alerts).toEqual([{ id: "alert-1" }]);
    expect(result.invitations).toEqual([{ id: "invite-1" }]);
    expect(result.activity).toEqual([]);
  });

  it("returns null for the profile (not a rejection) when the caller has no talent profile yet, while every other piece still resolves normally", async () => {
    const { service } = makeService(
      {
        findByUserId: jest.fn().mockResolvedValue(null),
        findTalentIdByUserId: jest.fn().mockResolvedValue(null),
      },
      {},
      {
        applicationsService: {
          findAllForUser: jest
            .fn()
            .mockResolvedValue({ applications: [], pagination: {} }),
          getStatusCounts: jest
            .fn()
            .mockResolvedValue({ total: 0, byStatus: {} }),
        },
        savedService: { findJobIdsForUser: jest.fn().mockResolvedValue([]) },
        alertsService: { listForUser: jest.fn().mockResolvedValue([]) },
        invitationsService: { listForTalent: jest.fn().mockResolvedValue([]) },
      },
    );

    const result = await service.getDashboard("no-profile-user");

    expect(result.profile).toBeNull();
    expect(result.applications).toEqual({ applications: [], pagination: {} });
    expect(result.activity).toEqual([]);
  });

  it("still rejects a real failure (not an expected condition) instead of swallowing it to null", async () => {
    // findTalentIdByUserId: null short-circuits getActivity/
    // getProfileViewAnalytics before they'd otherwise reach
    // findRecentStatusEvents/etc., which aren't stubbed in this test —
    // calling an unstubbed repo method throws its own synchronous TypeError
    // while building that method's internal Promise.all array, which would
    // orphan the already-rejected findByUserId promise below with no
    // attached handler and crash the test worker on an unhandled rejection
    // instead of failing this assertion cleanly (same failure mode as the
    // equivalent EmployerService.getDashboard test).
    const { service } = makeService(
      {
        findByUserId: jest.fn().mockRejectedValue(new Error("db down")),
        findTalentIdByUserId: jest.fn().mockResolvedValue(null),
      },
      {},
      {
        applicationsService: {
          findAllForUser: jest
            .fn()
            .mockResolvedValue({ applications: [], pagination: {} }),
          getStatusCounts: jest
            .fn()
            .mockResolvedValue({ total: 0, byStatus: {} }),
        },
        savedService: { findJobIdsForUser: jest.fn().mockResolvedValue([]) },
        alertsService: { listForUser: jest.fn().mockResolvedValue([]) },
        invitationsService: { listForTalent: jest.fn().mockResolvedValue([]) },
      },
    );

    await expect(service.getDashboard("talent-user-1")).rejects.toThrow(
      "db down",
    );
  });
});
