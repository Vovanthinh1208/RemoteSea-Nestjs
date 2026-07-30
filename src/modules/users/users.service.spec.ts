import type { ConfigService } from "@nestjs/config";
import { UsersService } from "./users.service";
import type { UsersRepository } from "./users.repository";
import type { UploadsService } from "@/modules/uploads/uploads.service";
import { ConflictApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { EnvConfig } from "@/core/config/env.validation";

const makeService = (
  repoOverrides: Partial<UsersRepository> = {},
  uploadsOverrides: Partial<UploadsService> = {},
) => {
  const usersRepository = {
    findProfileFileUrls: jest
      .fn()
      .mockResolvedValue({ resumeUrl: null, logoUrl: null }),
    ...repoOverrides,
  } as unknown as UsersRepository;
  const uploadsService = {
    deleteObjectByUrl: jest.fn().mockResolvedValue(undefined),
    ...uploadsOverrides,
  } as unknown as UploadsService;
  const config = {
    get: jest.fn().mockReturnValue("https://cdn.example.com"),
  } as unknown as ConfigService<EnvConfig, true>;
  return {
    service: new UsersService(usersRepository, uploadsService, config),
    usersRepository,
    uploadsService,
  };
};

// jobs.employerId is ON DELETE RESTRICT specifically so a self-service
// account delete can't cascade through EmployerProfile -> Job and silently
// wipe other users' Application/SavedJob rows — these cover the upfront
// check that turns that constraint into a clear error instead of a raw
// FK-violation.
describe("UsersService.deleteAccount", () => {
  it("blocks deletion and never calls deleteUser when the account owns active job postings", async () => {
    const { service, usersRepository } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(3),
      deleteUser: jest.fn(),
    });

    const error = await service
      .deleteAccount("user-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ACTIVE_JOBS_PREVENT_DELETION,
    });
    expect(usersRepository.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the account when it owns no job postings (talent, or an employer with none)", async () => {
    const { service, usersRepository } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    });

    await service.deleteAccount("user-1");

    expect(usersRepository.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("best-effort deletes the talent's resume from storage after the account row is gone", async () => {
    const { service, uploadsService } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      findProfileFileUrls: jest.fn().mockResolvedValue({
        resumeUrl: "https://cdn.example.com/uploads/resume-1.pdf",
        logoUrl: null,
      }),
    });

    await service.deleteAccount("user-1");

    expect(uploadsService.deleteObjectByUrl).toHaveBeenCalledWith(
      "https://cdn.example.com/uploads/resume-1.pdf",
    );
    expect(uploadsService.deleteObjectByUrl).toHaveBeenCalledTimes(1);
  });

  it("best-effort deletes the employer's logo from storage after the account row is gone", async () => {
    const { service, uploadsService } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      findProfileFileUrls: jest.fn().mockResolvedValue({
        resumeUrl: null,
        logoUrl: "https://cdn.example.com/uploads/logo-1.png",
      }),
    });

    await service.deleteAccount("user-1");

    expect(uploadsService.deleteObjectByUrl).toHaveBeenCalledWith(
      "https://cdn.example.com/uploads/logo-1.png",
    );
    expect(uploadsService.deleteObjectByUrl).toHaveBeenCalledTimes(1);
  });

  it("skips storage cleanup when the account had no uploaded file", async () => {
    const { service, uploadsService } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    });

    await service.deleteAccount("user-1");

    expect(uploadsService.deleteObjectByUrl).not.toHaveBeenCalled();
  });
});
