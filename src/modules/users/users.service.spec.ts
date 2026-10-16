import type { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { UsersService } from "./users.service";
import type { UsersRepository } from "./users.repository";
import type { UploadsService } from "@/modules/uploads/uploads.service";
import type { AuthService } from "@/modules/auth/auth.service";
import type { MetricsService } from "@/modules/metrics/metrics.service";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { EnvConfig } from "@/core/config/env.validation";

jest.mock("bcrypt");

const makeService = (
  repoOverrides: Partial<UsersRepository> = {},
  uploadsOverrides: Partial<UploadsService> = {},
  authOverrides: Partial<AuthService> = {},
) => {
  const usersRepository = {
    findProfileFileUrls: jest
      .fn()
      .mockResolvedValue({ resumeUrl: null, logoUrl: null }),
    countTeamObligations: jest
      .fn()
      .mockResolvedValue({ members: 0, pendingInvitations: 0 }),
    findPasswordHash: jest.fn().mockResolvedValue({ passwordHash: null }),
    updatePasswordHash: jest.fn().mockResolvedValue(undefined),
    ...repoOverrides,
  } as unknown as UsersRepository;
  const uploadsService = {
    deleteObjectByUrl: jest.fn().mockResolvedValue(undefined),
    ...uploadsOverrides,
  } as unknown as UploadsService;
  const config = {
    get: jest.fn().mockReturnValue("https://cdn.example.com"),
  } as unknown as ConfigService<EnvConfig, true>;
  const authService = {
    revokeAllSessionsForUser: jest.fn().mockResolvedValue(0),
    revokeOtherSessions: jest.fn().mockResolvedValue({ revokedCount: 0 }),
    ...authOverrides,
  } as unknown as AuthService;
  const metricsService = {
    recordAuthFailure: jest.fn(),
  } as unknown as MetricsService;
  return {
    service: new UsersService(
      usersRepository,
      uploadsService,
      config,
      authService,
      metricsService,
    ),
    usersRepository,
    uploadsService,
    authService,
    metricsService,
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
      .deleteAccount("user-1", { confirmation: "DELETE" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ACTIVE_JOBS_PREVENT_DELETION,
    });
    expect(usersRepository.deleteUser).not.toHaveBeenCalled();
  });

  it("blocks deletion and never calls deleteUser when the account's company has other active team members", async () => {
    const { service, usersRepository } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      countTeamObligations: jest
        .fn()
        .mockResolvedValue({ members: 2, pendingInvitations: 0 }),
      deleteUser: jest.fn(),
    });

    const error = await service
      .deleteAccount("user-1", { confirmation: "DELETE" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ACTIVE_TEAM_PREVENTS_DELETION,
    });
    expect(usersRepository.deleteUser).not.toHaveBeenCalled();
  });

  it("blocks deletion when the account's company has pending team invitations", async () => {
    const { service, usersRepository } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      countTeamObligations: jest
        .fn()
        .mockResolvedValue({ members: 0, pendingInvitations: 1 }),
      deleteUser: jest.fn(),
    });

    const error = await service
      .deleteAccount("user-1", { confirmation: "DELETE" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ACTIVE_TEAM_PREVENTS_DELETION,
    });
    expect(usersRepository.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the account when it owns no job postings (talent, or an employer with none)", async () => {
    const { service, usersRepository } = makeService({
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    });

    await service.deleteAccount("user-1", { confirmation: "DELETE" });

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

    await service.deleteAccount("user-1", { confirmation: "DELETE" });

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

    await service.deleteAccount("user-1", { confirmation: "DELETE" });

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

    await service.deleteAccount("user-1", { confirmation: "DELETE" });

    expect(uploadsService.deleteObjectByUrl).not.toHaveBeenCalled();
  });
});

describe("UsersService.changePassword", () => {
  it("rejects a social-only account with no password to check", async () => {
    const { service, usersRepository } = makeService({
      findPasswordHash: jest.fn().mockResolvedValue({ passwordHash: null }),
    });

    await expect(
      service.changePassword(
        "user-1",
        {
          currentPassword: "anything",
          newPassword: "newpassword123",
        },
        "sess-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password and records the auth-failure metric, without touching sessions", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const { service, usersRepository, authService, metricsService } =
      makeService({
        findPasswordHash: jest.fn().mockResolvedValue({ passwordHash: "hash" }),
      });

    const error = await service
      .changePassword(
        "user-1",
        {
          currentPassword: "wrong",
          newPassword: "newpassword123",
        },
        "sess-1",
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.CURRENT_PASSWORD_INCORRECT,
    });
    expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(authService.revokeOtherSessions).not.toHaveBeenCalled();
    expect(metricsService.recordAuthFailure).toHaveBeenCalledWith(
      "change_password_invalid_password",
    );
  });

  // A password change is the textbook case for forcing every other
  // session back through login — the old password is exactly what an
  // attacker riding an existing stolen session already knows. Same
  // reasoning as AuthService.disableTwoFactor's own session revocation.
  it("updates the password hash and revokes every OTHER session, keeping the current one (PB12)", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue("new-hash");
    const { service, usersRepository, authService } = makeService({
      findPasswordHash: jest.fn().mockResolvedValue({ passwordHash: "hash" }),
    });

    await service.changePassword(
      "user-1",
      {
        currentPassword: "correct",
        newPassword: "newpassword123",
      },
      "sess-1",
    );

    expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith(
      "user-1",
      "new-hash",
    );
    expect(authService.revokeOtherSessions).toHaveBeenCalledWith(
      "user-1",
      "sess-1",
    );
    expect(authService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it("rejects a new password identical to the current one (PB12 3.2)", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const { service, usersRepository } = makeService({
      findPasswordHash: jest.fn().mockResolvedValue({ passwordHash: "hash" }),
    });

    const error = await service
      .changePassword(
        "user-1",
        { currentPassword: "samepassword1", newPassword: "samepassword1" },
        "sess-1",
      )
      .catch((e: unknown) => e);

    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.NEW_PASSWORD_SAME_AS_CURRENT,
    });
    expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
  });
});

describe("UsersService.deleteAccount confirmation (PB20)", () => {
  it("refuses an account with a password when the password is missing or wrong, and deletes nothing", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const deleteUser = jest.fn();
    const { service } = makeService({
      findPasswordHash: jest.fn().mockResolvedValue({ passwordHash: "hash" }),
      deleteUser,
    });

    await expect(
      service.deleteAccount("user-1", { confirmation: "DELETE" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    await expect(
      service.deleteAccount("user-1", {
        password: "wrong",
        confirmation: "DELETE",
      }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("lets a password-less (social) account delete with only the confirmation", async () => {
    const deleteUser = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({
      findPasswordHash: jest.fn().mockResolvedValue({ passwordHash: null }),
      countEmployerJobs: jest.fn().mockResolvedValue(0),
      deleteUser,
    });

    await service.deleteAccount("user-1", { confirmation: "DELETE" });
    expect(deleteUser).toHaveBeenCalled();
  });
});

describe("UsersService.pauseAccount (PB16)", () => {
  it("flags the account paused and signs the user out of every session", async () => {
    const setPaused = jest.fn().mockResolvedValue({
      id: "user-1",
      isPaused: true,
      pausedAt: new Date(),
    });
    const { service, authService } = makeService({ setPaused });

    await service.pauseAccount("user-1");

    expect(setPaused).toHaveBeenCalledWith("user-1", true);
    expect(authService.revokeAllSessionsForUser).toHaveBeenCalledWith("user-1");
  });
});
