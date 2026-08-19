import type { ExecutionContext } from "@nestjs/common";
import { CompanyMemberOwnershipGuard } from "./company-member-ownership.guard";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { TeamRepository } from "../team.repository";
import type { PrismaService } from "@/core/database/prisma.service";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "member-2" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

const makeGuard = (
  targetMember: unknown,
  callerMembership: { employerId: string; role: string } | null,
) => {
  const findMemberById = jest.fn().mockResolvedValue(targetMember);
  const findUnique = jest.fn().mockResolvedValue(callerMembership);
  const prisma = {
    companyMember: { findUnique },
  } as unknown as PrismaService;
  return new CompanyMemberOwnershipGuard(prisma, {
    findMemberById,
  } as unknown as TeamRepository);
};

describe("CompanyMemberOwnershipGuard", () => {
  const targetMember = {
    id: "member-2",
    userId: "recruiter-user-1",
    employerId: "company-1",
    role: "RECRUITER",
  };

  it("allows the same-company OWNER to manage another member", async () => {
    const guard = makeGuard(targetMember, {
      employerId: "company-1",
      role: "OWNER",
    });

    const context = makeContext({ id: "owner-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("forbids a same-company RECRUITER — member management is OWNER only", async () => {
    const guard = makeGuard(targetMember, {
      employerId: "company-1",
      role: "RECRUITER",
    });

    const context = makeContext({ id: "another-recruiter", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });

  it("forbids an OWNER of a different company from touching this member", async () => {
    const guard = makeGuard(targetMember, {
      employerId: "some-other-company",
      role: "OWNER",
    });

    const context = makeContext({ id: "other-owner", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });
});
