import { WorkExperienceService } from "./work-experience.service";
import { MAX_WORK_EXPERIENCES_PER_PROFILE } from "./constants";
import {
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import type { WorkExperienceRepository } from "./work-experience.repository";

const makeService = (repoOverrides: Partial<WorkExperienceRepository> = {}) => {
  const repo = {
    findTalentIdByUserId: jest.fn().mockResolvedValue({ id: "talent-1" }),
    countByTalentId: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({ id: "exp-1" }),
    update: jest.fn().mockResolvedValue({ id: "exp-1" }),
    ...repoOverrides,
  } as unknown as WorkExperienceRepository;
  return { service: new WorkExperienceService(repo), repo };
};

describe("WorkExperienceService.listForUser", () => {
  it("returns an empty array rather than erroring when the caller has no TalentProfile", async () => {
    const { service } = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue(null),
    });

    await expect(service.listForUser("user-1")).resolves.toEqual([]);
  });
});

describe("WorkExperienceService.create", () => {
  it("requires a TalentProfile to already exist", async () => {
    const { service } = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.create("user-1", {
        company: "Finch Labs",
        title: "Engineer",
        startDate: new Date("2023-01-01"),
      }),
    ).rejects.toBeInstanceOf(ForbiddenApiException);
  });

  it("rejects a 6th entry once the profile already has 5", async () => {
    const { service } = makeService({
      countByTalentId: jest
        .fn()
        .mockResolvedValue(MAX_WORK_EXPERIENCES_PER_PROFILE),
    });

    await expect(
      service.create("user-1", {
        company: "Finch Labs",
        title: "Engineer",
        startDate: new Date("2023-01-01"),
      }),
    ).rejects.toBeInstanceOf(ConflictApiException);
  });

  it("creates when under the cap", async () => {
    const create = jest.fn().mockResolvedValue({ id: "exp-1" });
    const { service } = makeService({ create });

    await service.create("user-1", {
      company: "Finch Labs",
      title: "Engineer",
      startDate: new Date("2023-01-01"),
    });

    expect(create).toHaveBeenCalledWith(
      "talent-1",
      expect.objectContaining({ company: "Finch Labs" }),
    );
  });
});

// PB24 RC2: start date strictly before end date, also for a partial PATCH.
describe("WorkExperienceService.update (PB24)", () => {
  const experience = {
    id: "exp-1",
    talentId: "talent-1",
    startDate: new Date("2024-03-01"),
    endDate: new Date("2025-01-01"),
    talent: { userId: "user-1" },
  };

  it.each([
    [
      "an end date equal to the stored start",
      { endDate: new Date("2024-03-01") },
    ],
    [
      "an end date before the stored start",
      { endDate: new Date("2023-12-01") },
    ],
    [
      "a start date after the stored end",
      { startDate: new Date("2025-06-01") },
    ],
  ])("rejects %s", async (_label, dto) => {
    const { service, repo } = makeService();
    await expect(service.update(experience, dto)).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("accepts a valid change and clearing the end date (current role)", async () => {
    const { service, repo } = makeService();
    await service.update(experience, { endDate: new Date("2025-02-01") });
    await service.update(experience, { endDate: null });
    expect(repo.update).toHaveBeenCalledTimes(2);
  });
});
