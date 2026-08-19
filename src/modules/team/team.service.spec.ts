import { TeamService } from "./team.service";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { TeamRepository } from "./team.repository";
import type { CompanyMembershipService } from "@/modules/company/company-membership.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

const makeService = (
  repoOverrides: Partial<TeamRepository> = {},
  resolveMembership: jest.Mock = jest.fn().mockResolvedValue(null),
) => {
  const repo = {
    findMembersByCompany: jest.fn().mockResolvedValue([]),
    findCompanyName: jest.fn().mockResolvedValue({ companyName: "Acme Inc" }),
    findUserByEmail: jest.fn().mockResolvedValue(null),
    findPendingInvitationByEmail: jest.fn().mockResolvedValue(null),
    createInvitation: jest.fn(),
    findPendingInvitationsByCompany: jest.fn().mockResolvedValue([]),
    findInvitationById: jest.fn().mockResolvedValue(null),
    revokeInvitation: jest.fn().mockResolvedValue(undefined),
    findInvitationByToken: jest.fn().mockResolvedValue(null),
    acceptInvitation: jest.fn().mockResolvedValue(true),
    countOwners: jest.fn().mockResolvedValue(2),
    updateRole: jest.fn(),
    removeMember: jest.fn().mockResolvedValue(undefined),
    ...repoOverrides,
  } as unknown as TeamRepository;
  const companyMembershipService = {
    resolveMembership,
  } as unknown as CompanyMembershipService;
  const emailService = {
    sendTeamInvitationEmail: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new TeamService(
      repo,
      companyMembershipService,
      emailService as never,
    ),
    repo,
    resolveMembership,
    emailService,
  };
};

const OWNER_MEMBERSHIP = { employerId: "company-1", role: "OWNER" };
const RECRUITER_MEMBERSHIP = { employerId: "company-1", role: "RECRUITER" };

describe("TeamService — owner can manage the team", () => {
  it("lets an OWNER invite a member", async () => {
    const { service, repo } = makeService(
      {
        createInvitation: jest.fn().mockResolvedValue({
          id: "inv-1",
          email: "new@acme.com",
          role: "RECRUITER",
          expiresAt: new Date(),
        }),
      },
      jest.fn().mockResolvedValue(OWNER_MEMBERSHIP),
    );

    const result = await service.inviteMember("owner-1", {
      email: "new@acme.com",
      role: "RECRUITER",
    });

    expect(repo.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        employerId: "company-1",
        email: "new@acme.com",
        role: "RECRUITER",
        invitedById: "owner-1",
      }),
    );
    expect(result.email).toBe("new@acme.com");
  });

  it("lets an OWNER update another member's role", async () => {
    const { service, repo } = makeService({
      updateRole: jest
        .fn()
        .mockResolvedValue({ id: "member-2", role: "HIRING_MANAGER" }),
    });

    await service.updateMemberRole(
      { id: "member-2", employerId: "company-1", role: "RECRUITER" },
      { role: "HIRING_MANAGER" },
    );

    expect(repo.updateRole).toHaveBeenCalledWith("member-2", "HIRING_MANAGER");
  });

  it("lets an OWNER remove another member", async () => {
    const { service, repo } = makeService();

    await service.removeMember({
      id: "member-2",
      employerId: "company-1",
      role: "RECRUITER",
    });

    expect(repo.removeMember).toHaveBeenCalledWith("member-2");
  });
});

describe("TeamService — non-owner cannot manage the team", () => {
  it("rejects a RECRUITER inviting a member", async () => {
    const { service } = makeService(
      {},
      jest.fn().mockResolvedValue(RECRUITER_MEMBERSHIP),
    );

    const error = await service
      .inviteMember("recruiter-1", {
        email: "x@acme.com",
        role: "INTERVIEWER",
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.INSUFFICIENT_COMPANY_ROLE,
    });
  });

  it("rejects listing pending invitations for a caller with no company at all", async () => {
    const { service } = makeService({}, jest.fn().mockResolvedValue(null));

    const error = await service
      .listPendingInvitations("no-company-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.COMPANY_MEMBERSHIP_REQUIRED,
    });
  });
});

describe("TeamService — cannot strand a company with zero owners", () => {
  it("rejects demoting the last remaining OWNER", async () => {
    const { service } = makeService({
      countOwners: jest.fn().mockResolvedValue(1),
    });

    await expect(
      service.updateMemberRole(
        { id: "member-1", employerId: "company-1", role: "OWNER" },
        { role: "RECRUITER" },
      ),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects removing the last remaining OWNER", async () => {
    const { service } = makeService({
      countOwners: jest.fn().mockResolvedValue(1),
    });

    await expect(
      service.removeMember({
        id: "member-1",
        employerId: "company-1",
        role: "OWNER",
      }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("allows demoting an OWNER when a co-owner still remains", async () => {
    const { service, repo } = makeService({
      countOwners: jest.fn().mockResolvedValue(2),
    });

    await service.updateMemberRole(
      { id: "member-1", employerId: "company-1", role: "OWNER" },
      { role: "RECRUITER" },
    );

    expect(repo.updateRole).toHaveBeenCalledWith("member-1", "RECRUITER");
  });
});

describe("TeamService — invitation flow", () => {
  it("rejects inviting an email that already belongs to a company", async () => {
    // First call: caller's own membership (must be OWNER to reach this far).
    // Second call: the target email's existing-user membership check.
    const resolveMembership = jest
      .fn()
      .mockResolvedValueOnce(OWNER_MEMBERSHIP)
      .mockResolvedValueOnce({ employerId: "company-2", role: "RECRUITER" });
    const { service } = makeService(
      { findUserByEmail: jest.fn().mockResolvedValue({ id: "existing-user" }) },
      resolveMembership,
    );

    const error = await service
      .inviteMember("owner-1", {
        email: "already@member.com",
        role: "RECRUITER",
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ALREADY_COMPANY_MEMBER,
    });
  });

  it("rejects a duplicate pending invitation to the same email", async () => {
    const { service } = makeService(
      {
        findPendingInvitationByEmail: jest
          .fn()
          .mockResolvedValue({ id: "inv-existing" }),
      },
      jest.fn().mockResolvedValue(OWNER_MEMBERSHIP),
    );

    const error = await service
      .inviteMember("owner-1", { email: "dup@acme.com", role: "RECRUITER" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.TEAM_INVITATION_ALREADY_PENDING,
    });
  });

  it("sends the invitation email with the company name and offered role", async () => {
    const { service, emailService } = makeService(
      {
        createInvitation: jest.fn().mockResolvedValue({
          id: "inv-1",
          email: "new@acme.com",
          role: "HIRING_MANAGER",
          expiresAt: new Date(),
        }),
      },
      jest.fn().mockResolvedValue(OWNER_MEMBERSHIP),
    );

    await service.inviteMember("owner-1", {
      email: "new@acme.com",
      role: "HIRING_MANAGER",
    });

    expect(emailService.sendTeamInvitationEmail).toHaveBeenCalledWith(
      "new@acme.com",
      "Acme Inc",
      "HIRING_MANAGER",
      expect.any(String),
    );
  });

  const invitedUser: AuthenticatedUser = {
    id: "invitee-1",
    email: "invitee@acme.com",
    name: "Invitee",
    role: "TALENT",
  };

  it("accepts a valid invitation and returns the new membership", async () => {
    // First call: pre-accept "does the caller already belong somewhere"
    // check (must be null). Second call: post-accept lookup, used to scope
    // findMembersByCompany to the caller's new company.
    const resolveMembership = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ employerId: "company-1", role: "RECRUITER" });
    const { service, repo } = makeService(
      {
        findInvitationByToken: jest.fn().mockResolvedValue({
          id: "inv-1",
          employerId: "company-1",
          email: "invitee@acme.com",
          role: "RECRUITER",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 60_000),
        }),
        findMembersByCompany: jest
          .fn()
          .mockResolvedValue([
            { id: "member-1", userId: "invitee-1", role: "RECRUITER" },
          ]),
      },
      resolveMembership,
    );

    const result = await service.acceptInvitation(invitedUser, {
      token: "good-token",
    });

    expect(repo.acceptInvitation).toHaveBeenCalledWith(
      "inv-1",
      "invitee-1",
      "company-1",
      "RECRUITER",
    );
    expect(result.userId).toBe("invitee-1");
  });

  it("rejects an expired invitation", async () => {
    const { service } = makeService({
      findInvitationByToken: jest.fn().mockResolvedValue({
        id: "inv-1",
        employerId: "company-1",
        email: "invitee@acme.com",
        role: "RECRUITER",
        status: "PENDING",
        expiresAt: new Date(Date.now() - 60_000),
      }),
    });

    await expect(
      service.acceptInvitation(invitedUser, { token: "expired-token" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects accepting with an account whose email doesn't match the invitation", async () => {
    const { service } = makeService({
      findInvitationByToken: jest.fn().mockResolvedValue({
        id: "inv-1",
        employerId: "company-1",
        email: "someone-else@acme.com",
        role: "RECRUITER",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60_000),
      }),
    });

    const error = await service
      .acceptInvitation(invitedUser, { token: "good-token" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.TEAM_INVITATION_EMAIL_MISMATCH,
    });
  });

  it("rejects accepting when the caller already belongs to a company", async () => {
    const { service } = makeService(
      {
        findInvitationByToken: jest.fn().mockResolvedValue({
          id: "inv-1",
          employerId: "company-1",
          email: "invitee@acme.com",
          role: "RECRUITER",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      jest.fn().mockResolvedValue({
        employerId: "already-a-member-of",
        role: "RECRUITER",
      }),
    );

    const error = await service
      .acceptInvitation(invitedUser, { token: "good-token" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ALREADY_COMPANY_MEMBER,
    });
  });

  it("rejects a race where the invitation was already accepted between the read and the write", async () => {
    const { service } = makeService({
      findInvitationByToken: jest.fn().mockResolvedValue({
        id: "inv-1",
        employerId: "company-1",
        email: "invitee@acme.com",
        role: "RECRUITER",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60_000),
      }),
      acceptInvitation: jest.fn().mockResolvedValue(false),
    });

    await expect(
      service.acceptInvitation(invitedUser, { token: "raced-token" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });
});
