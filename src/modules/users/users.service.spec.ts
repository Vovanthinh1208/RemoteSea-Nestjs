import { UsersService } from "./users.service";
import type { UsersRepository } from "./users.repository";
import { ConflictApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const makeService = (repoOverrides: Partial<UsersRepository> = {}) => {
  const usersRepository = { ...repoOverrides } as unknown as UsersRepository;
  return { service: new UsersService(usersRepository), usersRepository };
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
});
