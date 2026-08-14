import { TalentService } from "./talent.service";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import type { TalentRepository } from "./talent.repository";
import type { UploadsService } from "@/modules/uploads/uploads.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

const makeService = (repoOverrides: Partial<TalentRepository> = {}) => {
  const repo = {
    findUserName: jest.fn().mockResolvedValue({ name: "Ada" }),
    findSalaryAndResumeByUserId: jest.fn().mockResolvedValue(null),
    upsertProfileWithSkills: jest.fn().mockResolvedValue({ id: "profile-1" }),
    findByIdWithSkills: jest.fn().mockResolvedValue({ id: "profile-1" }),
    isVerifiedEmployer: jest.fn().mockResolvedValue(false),
    search: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    ...repoOverrides,
  } as unknown as TalentRepository;
  const config = { get: jest.fn().mockReturnValue("https://cdn.example.com") };
  return {
    service: new TalentService(repo, config as never, {} as UploadsService),
    repo,
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
