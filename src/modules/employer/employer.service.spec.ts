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

const makeService = (
  repoOverrides: Partial<EmployerRepository> = {},
  emailServiceOverrides: Record<string, jest.Mock> = {},
) => {
  const repo = {
    updateApplication: jest.fn(),
    ...repoOverrides,
  } as unknown as EmployerRepository;
  const emailService = {
    sendEmployerVerificationEmail: jest.fn().mockResolvedValue(undefined),
    ...emailServiceOverrides,
  };
  const service = new EmployerService(
    repo,
    {} as never,
    {} as never,
    emailService as never,
  );
  return { service, repo, emailService };
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

describe("EmployerService.submitVerification", () => {
  const profile = {
    id: "emp-1",
    companyName: "Acme Inc",
    websiteUrl: "https://acme.com",
  };

  it("rejects when no websiteUrl is on file", async () => {
    const { service } = makeService({
      findProfileForVerification: jest
        .fn()
        .mockResolvedValue({ ...profile, websiteUrl: null }),
    });

    await expect(
      service.submitVerification("user-1", { email: "jane@acme.com" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects when the email domain doesn't match the website", async () => {
    const { service, repo } = makeService({
      findProfileForVerification: jest.fn().mockResolvedValue(profile),
      createEmailVerification: jest.fn(),
    });

    await expect(
      service.submitVerification("user-1", { email: "jane@other.com" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(repo.createEmailVerification).not.toHaveBeenCalled();
  });

  it("accepts a matching domain (ignoring www.) and sends the email", async () => {
    const { service, repo, emailService } = makeService({
      findProfileForVerification: jest
        .fn()
        .mockResolvedValue({ ...profile, websiteUrl: "https://www.acme.com" }),
      createEmailVerification: jest.fn().mockResolvedValue(undefined),
    });

    await service.submitVerification("user-1", { email: "jane@acme.com" });

    expect(repo.createEmailVerification).toHaveBeenCalledWith(
      "emp-1",
      "jane@acme.com",
      expect.any(String),
      expect.any(Date),
    );
    expect(emailService.sendEmployerVerificationEmail).toHaveBeenCalledWith(
      "jane@acme.com",
      "Acme Inc",
      expect.any(String),
    );
  });
});

describe("EmployerService.confirmVerification", () => {
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
        employerId: "emp-1",
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 10_000),
      }),
    });

    await expect(
      service.confirmVerification({ token: "used" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("marks the employer FAILED and rejects an expired token", async () => {
    const { service, repo } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        employerId: "emp-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() - 10_000),
      }),
      markVerificationFailed: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.confirmVerification({ token: "expired" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(repo.markVerificationFailed).toHaveBeenCalledWith("emp-1");
  });

  it("consumes a valid token and verifies the employer", async () => {
    const { service, repo } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        employerId: "emp-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
      }),
      consumeEmailVerification: jest.fn().mockResolvedValue(true),
    });

    await service.confirmVerification({ token: "good" });
    expect(repo.consumeEmailVerification).toHaveBeenCalledWith(
      "ver-1",
      "emp-1",
    );
  });

  it("rejects when consumeEmailVerification loses the race (already consumed concurrently)", async () => {
    const { service } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        employerId: "emp-1",
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
