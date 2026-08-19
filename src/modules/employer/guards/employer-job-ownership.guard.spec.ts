import type { ExecutionContext } from "@nestjs/common";
import { EmployerJobOwnershipGuard } from "./employer-job-ownership.guard";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { EmployerRepository } from "../employer.repository";
import type { PrismaService } from "@/core/database/prisma.service";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "job-1" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

const makeGuard = (
  job: unknown,
  membership: { employerId: string; role: string } | null,
) => {
  const findJobWithEmployerOwner = jest.fn().mockResolvedValue(job);
  const findUnique = jest.fn().mockResolvedValue(membership);
  const prisma = {
    companyMember: { findUnique },
  } as unknown as PrismaService;
  return new EmployerJobOwnershipGuard(prisma, {
    findJobWithEmployerOwner,
  } as unknown as EmployerRepository);
};

describe("EmployerJobOwnershipGuard", () => {
  const job = { id: "job-1", employerId: "company-1" };

  it("allows a same-company OWNER/RECRUITER/HIRING_MANAGER", async () => {
    const guard = makeGuard(job, {
      employerId: "company-1",
      role: "HIRING_MANAGER",
    });

    const context = makeContext({ id: "manager-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("has no admin bypass — forbids a non-member even if they're an admin", async () => {
    const guard = makeGuard(job, null);

    const context = makeContext({ id: "someone-else", role: "ADMIN" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });

  it("forbids an INTERVIEWER — no blanket access to a job's full applicant list", async () => {
    const guard = makeGuard(job, {
      employerId: "company-1",
      role: "INTERVIEWER",
    });

    const context = makeContext({ id: "interviewer-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });

  it("forbids a member of a different company", async () => {
    const guard = makeGuard(job, {
      employerId: "another-company",
      role: "OWNER",
    });

    const context = makeContext({ id: "outsider-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });
});
