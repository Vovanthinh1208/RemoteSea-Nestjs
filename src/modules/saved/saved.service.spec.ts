import { SavedService } from "./saved.service";
import type { SavedRepository } from "./saved.repository";
import type { SavedJobWithJob } from "./interfaces";

describe("SavedService.findAllForUser", () => {
  it("converts page/limit to skip and wraps the result in a pagination envelope", async () => {
    const rows = [{ jobId: "job-1" } as unknown as SavedJobWithJob];
    const findAllForUser = jest.fn().mockResolvedValue([rows, 45]);
    const service = new SavedService({
      findAllForUser,
    } as unknown as SavedRepository);

    const result = await service.findAllForUser("user-1", 3, 20);

    expect(findAllForUser).toHaveBeenCalledWith("user-1", 40, 20);
    expect(result).toEqual({
      savedJobs: rows,
      pagination: { page: 3, limit: 20, total: 45, pages: 3 },
    });
  });
});

describe("SavedService.findJobIdsForUser", () => {
  it("delegates straight to the repository", async () => {
    const findJobIdsForUser = jest.fn().mockResolvedValue(["job-1", "job-2"]);
    const service = new SavedService({
      findJobIdsForUser,
    } as unknown as SavedRepository);

    await expect(service.findJobIdsForUser("user-1")).resolves.toEqual([
      "job-1",
      "job-2",
    ]);
  });
});
