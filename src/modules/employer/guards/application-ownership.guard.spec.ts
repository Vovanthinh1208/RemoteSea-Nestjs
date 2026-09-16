import type { ExecutionContext } from "@nestjs/common";
import { ApplicationOwnershipGuard } from "./application-ownership.guard";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { EmployerRepository } from "../employer.repository";
import type { PrismaService } from "@/core/database/prisma.service";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "app-1" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

const makeGuard = (
  application: unknown,
  membership: {
    employerId: string;
    role: string;
    suspendedAt?: Date | null;
  } | null,
) => {
  const findApplicationWithJobOwner = jest.fn().mockResolvedValue(application);
  const findUnique = jest.fn().mockResolvedValue(
    membership && {
      employerId: membership.employerId,
      role: membership.role,
      employer: { suspendedAt: membership.suspendedAt ?? null },
    },
  );
  const prisma = {
    companyMember: { findUnique },
  } as unknown as PrismaService;
  return new ApplicationOwnershipGuard(prisma, {
    findApplicationWithJobOwner,
  } as unknown as EmployerRepository);
};

describe("ApplicationOwnershipGuard", () => {
  const application = {
    id: "app-1",
    status: "PENDING",
    job: { employerId: "company-1" },
    interview: { interviewerId: null },
  };

  it("allows a member of the application's own company with an allowed role", async () => {
    const guard = makeGuard(application, {
      employerId: "company-1",
      role: "RECRUITER",
    });

    const context = makeContext({ id: "recruiter-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("forbids a member of a different company", async () => {
    const guard = makeGuard(application, {
      employerId: "some-other-company",
      role: "OWNER",
    });

    const context = makeContext({ id: "outsider-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });

  it("forbids a same-company INTERVIEWER not assigned to this application", async () => {
    const guard = makeGuard(application, {
      employerId: "company-1",
      role: "INTERVIEWER",
    });

    const context = makeContext({ id: "interviewer-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });

  it("forbids a caller with no company membership at all", async () => {
    const guard = makeGuard(application, null);

    const context = makeContext({ id: "no-company-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });
});
