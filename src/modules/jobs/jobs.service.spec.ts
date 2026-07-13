import { JobsService } from "./jobs.service";
import {
  ForbiddenApiException,
  BadRequestApiException,
} from "@/common/exceptions/api.exception";
import type { JobsRepository } from "./jobs.repository";
import type { JobWithOwner } from "./guards/job-ownership.guard";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

// Ownership is enforced upstream by JobOwnershipGuard — these tests cover only
// what's left in the service: the admin bypass, the DRAFT/REJECTED-only editing
// rule, salary re-validation, and the atomic updateIfEditable re-check.

const baseJob = {
  id: "job-1",
  status: "DRAFT",
  salaryMin: 1000,
  salaryMax: 2000,
  employer: { userId: "owner-1" },
} as unknown as JobWithOwner;

const owner: AuthenticatedUser = {
  id: "owner-1",
  email: "owner@example.com",
  name: "Owner",
  role: "EMPLOYER",
};
const admin: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN",
};

const makeService = (repoOverrides: Partial<JobsRepository> = {}) => {
  const repo = {
    update: jest.fn(),
    updateIfEditable: jest.fn(),
    ...repoOverrides,
  } as unknown as JobsRepository;
  return { service: new JobsService(repo, {} as never), repo };
};

describe("JobsService.update", () => {
  it("admins bypass the DRAFT/REJECTED restriction and write unconditionally", async () => {
    const { service, repo } = makeService({
      update: jest.fn().mockResolvedValue({ ...baseJob, status: "ACTIVE" }),
    });
    const activeJob = { ...baseJob, status: "ACTIVE" } as JobWithOwner;

    await service.update(activeJob, admin, { title: "New title" });
    expect(repo.update).toHaveBeenCalledWith("job-1", { title: "New title" });
  });

  it("rejects a non-admin editing a job that isn't DRAFT or REJECTED", async () => {
    const { service } = makeService();
    const activeJob = { ...baseJob, status: "ACTIVE" } as JobWithOwner;

    await expect(
      service.update(activeJob, owner, { title: "New title" }),
    ).rejects.toBeInstanceOf(ForbiddenApiException);
  });

  it("rejects a salary update where the effective max would be below the effective min", async () => {
    const { service } = makeService();

    await expect(
      service.update(baseJob, owner, { salaryMax: 500 }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("writes via updateIfEditable for a valid non-admin edit", async () => {
    const updated = { ...baseJob, title: "New title" };
    const { service, repo } = makeService({
      updateIfEditable: jest.fn().mockResolvedValue(updated),
    });

    const result = await service.update(baseJob, owner, { title: "New title" });
    expect(repo.updateIfEditable).toHaveBeenCalledWith("job-1", {
      title: "New title",
    });
    expect(result).toBe(updated);
  });

  it("throws Forbidden when updateIfEditable finds the job was concurrently made non-editable", async () => {
    const { service } = makeService({
      updateIfEditable: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(baseJob, owner, { title: "New title" }),
    ).rejects.toBeInstanceOf(ForbiddenApiException);
  });
});
