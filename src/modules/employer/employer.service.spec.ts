import { EmployerService } from "./employer.service";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import type { EmployerRepository } from "./employer.repository";
import type { ApplicationWithJobOwner } from "./guards/application-ownership.guard";

// Ownership is enforced upstream by ApplicationOwnershipGuard — these tests cover
// only what's left in the service: the ALLOWED_TRANSITIONS validation and the
// concurrent-update conflict path.

const application = {
  id: "app-1",
  status: "PENDING",
  job: { employer: { userId: "owner-1" } },
} as unknown as ApplicationWithJobOwner;

const makeService = (repoOverrides: Partial<EmployerRepository> = {}) => {
  const repo = { updateApplication: jest.fn(), ...repoOverrides } as unknown as EmployerRepository;
  const service = new EmployerService(
    repo,
    {} as never,
    {} as never,
  );
  return { service, repo };
};

describe("EmployerService.updateApplication", () => {
  it("allows a valid transition (PENDING -> REVIEWING)", async () => {
    const updated = { ...application, status: "REVIEWING" };
    const { service, repo } = makeService({
      updateApplication: jest.fn().mockResolvedValue(updated),
    });

    const result = await service.updateApplication(application, {
      status: "REVIEWING",
    });
    expect(repo.updateApplication).toHaveBeenCalledWith(
      "app-1",
      "PENDING",
      "REVIEWING",
      undefined,
    );
    expect(result).toBe(updated);
  });

  it("rejects an invalid transition (PENDING -> OFFERED)", async () => {
    const { service } = makeService();

    await expect(
      service.updateApplication(application, { status: "OFFERED" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("allows a no-op status update (same status, e.g. notes-only edit)", async () => {
    const updated = { ...application };
    const { service, repo } = makeService({
      updateApplication: jest.fn().mockResolvedValue(updated),
    });

    await service.updateApplication(application, {
      status: "PENDING",
      notes: "left a note",
    });
    expect(repo.updateApplication).toHaveBeenCalledWith(
      "app-1",
      "PENDING",
      "PENDING",
      "left a note",
    );
  });

  it("throws Conflict when the row was updated concurrently", async () => {
    const { service } = makeService({
      updateApplication: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.updateApplication(application, { status: "REVIEWING" }),
    ).rejects.toBeInstanceOf(ConflictApiException);
  });
});
