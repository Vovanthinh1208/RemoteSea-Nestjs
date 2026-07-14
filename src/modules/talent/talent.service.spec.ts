import { TalentService } from "./talent.service";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import type { TalentRepository } from "./talent.repository";
import type { UploadsService } from "@/modules/uploads/uploads.service";

const makeService = (repoOverrides: Partial<TalentRepository> = {}) => {
  const repo = {
    findUserName: jest.fn().mockResolvedValue({ name: "Ada" }),
    findSalaryAndResumeByUserId: jest.fn().mockResolvedValue(null),
    upsertProfileWithSkills: jest.fn().mockResolvedValue({ id: "profile-1" }),
    findByIdWithSkills: jest.fn().mockResolvedValue({ id: "profile-1" }),
    ...repoOverrides,
  } as unknown as TalentRepository;
  const config = { get: jest.fn().mockReturnValue("https://cdn.example.com") };
  return { service: new TalentService(repo, config as never, {} as UploadsService), repo };
};

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
