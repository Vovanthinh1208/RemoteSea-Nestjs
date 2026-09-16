import type { ExecutionContext } from "@nestjs/common";
import { JobOwnershipGuard } from "./job-ownership.guard";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { JobsRepository } from "../jobs.repository";
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
  membership: {
    employerId: string;
    role: string;
    suspendedAt?: Date | null;
  } | null,
) => {
  const findById = jest.fn().mockResolvedValue(job);
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
  return new JobOwnershipGuard(prisma, {
    findById,
  } as unknown as JobsRepository);
};

describe("JobOwnershipGuard", () => {
  const job = { id: "job-1", employerId: "company-1" };

  it("allows a same-company OWNER/RECRUITER", async () => {
    const guard = makeGuard(job, {
      employerId: "company-1",
      role: "RECRUITER",
    });

    const context = makeContext({ id: "recruiter-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("allows ADMIN even with no company membership at all", async () => {
    const guard = makeGuard(job, null);

    const context = makeContext({ id: "admin-1", role: "ADMIN" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("forbids a same-company HIRING_MANAGER/INTERVIEWER — job editing is OWNER/RECRUITER only", async () => {
    const guard = makeGuard(job, {
      employerId: "company-1",
      role: "HIRING_MANAGER",
    });

    const context = makeContext({ id: "manager-1", role: "EMPLOYER" });
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

  // CompanyOwnershipGuardBase's suspension check — covers every subclass
  // (job/employer-job/application/company-member/job-payer ownership), only
  // exercised here to avoid duplicating the same base-class test five times.
  it("forbids an OWNER of a suspended company, even though OWNER is normally allowed", async () => {
    const guard = makeGuard(job, {
      employerId: "company-1",
      role: "OWNER",
      suspendedAt: new Date(),
    });

    const context = makeContext({ id: "owner-1", role: "EMPLOYER" });
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: "COMPANY_SUSPENDED",
    });
  });

  it("still allows ADMIN to access a job at a suspended company", async () => {
    const guard = makeGuard(job, {
      employerId: "company-1",
      role: "OWNER",
      suspendedAt: new Date(),
    });

    const context = makeContext({ id: "admin-1", role: "ADMIN" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
