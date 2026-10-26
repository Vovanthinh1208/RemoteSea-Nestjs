import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { TeamRepository } from "./team.repository";
import { INVITATION_TOKEN_TTL_MS } from "./constants";
import type { PendingInvitation, TeamMember } from "./interfaces";
import type { InviteMemberDto } from "./dto/invite-member.dto";
import type { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import type { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { EmailService } from "@/common/services/email.service";
import { runInBackground } from "@/common/utils/background-task.util";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { assertFound } from "@/common/utils/assert-found";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { CompanyMembershipService } from "@/modules/company/company-membership.service";
import type { CompanyMembership } from "@/modules/company/company-membership.interfaces";
import {
  ALL_COMPANY_ROLES,
  OWNER_ONLY,
  requireCompanyRole,
} from "@/common/authorization/company-role.util";

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly teamRepository: TeamRepository,
    private readonly companyMembershipService: CompanyMembershipService,
    private readonly emailService: EmailService,
  ) {}

  private async requireOwner(userId: string): Promise<CompanyMembership> {
    const membership =
      await this.companyMembershipService.resolveMembership(userId);
    return requireCompanyRole(
      membership,
      OWNER_ONLY,
      "Only the company owner can manage the team",
    );
  }

  async listMembers(userId: string): Promise<TeamMember[]> {
    const rawMembership =
      await this.companyMembershipService.resolveMembership(userId);
    // ALL_COMPANY_ROLES, not a real role restriction (every seat may view the
    // roster) — routed through requireCompanyRole instead of a bare
    // null-check so a suspended company's own members lose this too, same as
    // requireOwner's other team-management calls below.
    const membership = requireCompanyRole(
      rawMembership,
      ALL_COMPANY_ROLES,
      "Your role doesn't allow viewing the team",
    );
    return this.teamRepository.findMembersByCompany(membership.employerId);
  }

  async listPendingInvitations(userId: string): Promise<PendingInvitation[]> {
    const membership = await this.requireOwner(userId);
    return this.teamRepository.findPendingInvitationsByCompany(
      membership.employerId,
    );
  }

  async inviteMember(
    userId: string,
    dto: InviteMemberDto,
  ): Promise<{ id: string; email: string; role: string; expiresAt: Date }> {
    const membership = await this.requireOwner(userId);
    const company = await this.teamRepository.findCompanyName(
      membership.employerId,
    );
    assertFound(company);

    const existingUser = await this.teamRepository.findUserByEmail(dto.email);
    if (existingUser) {
      const existingMembership =
        await this.companyMembershipService.resolveMembership(existingUser.id);
      if (existingMembership) {
        throw new ConflictApiException(
          "This person is already on a company team",
          ErrorCode.ALREADY_COMPANY_MEMBER,
        );
      }
    }

    const existingInvite =
      await this.teamRepository.findPendingInvitationByEmail(
        membership.employerId,
        dto.email,
      );
    if (existingInvite) {
      throw new ConflictApiException(
        "This email already has a pending invitation",
        ErrorCode.TEAM_INVITATION_ALREADY_PENDING,
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_MS);
    let invitation: Awaited<ReturnType<TeamRepository["createInvitation"]>>;
    try {
      invitation = await this.teamRepository.createInvitation({
        employerId: membership.employerId,
        email: dto.email,
        role: dto.role,
        token,
        invitedById: userId,
        expiresAt,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictApiException(
          "This email already has a pending invitation",
          ErrorCode.TEAM_INVITATION_ALREADY_PENDING,
        );
      }
      throw error;
    }

    runInBackground(
      this.emailService.sendTeamInvitationEmail(
        dto.email,
        company.companyName,
        dto.role,
        token,
      ),
      this.logger,
      `Failed to send team invitation email for company ${membership.employerId}`,
    );

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async revokeInvitation(userId: string, invitationId: string): Promise<void> {
    const membership = await this.requireOwner(userId);
    const invitation =
      await this.teamRepository.findInvitationById(invitationId);
    assertFound(
      invitation,
      "Invitation not found",
      ErrorCode.TEAM_INVITATION_NOT_FOUND,
    );
    if (invitation.employerId !== membership.employerId) {
      throw new ForbiddenApiException(
        "Not your company's invitation",
        ErrorCode.TEAM_INVITATION_NOT_FOUND,
      );
    }
    // PB38 precondition: only a PENDING invitation can be revoked.
    const revoked = await this.teamRepository.revokeInvitation(invitationId);
    if (!revoked) {
      throw new ConflictApiException(
        "Only a pending invitation can be revoked",
        ErrorCode.TEAM_INVITATION_NOT_PENDING,
      );
    }
  }

  async previewInvitation(token: string): Promise<{
    companyName: string;
    role: string;
    email: string;
    valid: boolean;
  }> {
    const invitation = await this.teamRepository.findInvitationByToken(token);
    assertFound(
      invitation,
      "Invitation not found",
      ErrorCode.TEAM_INVITATION_NOT_FOUND,
    );
    const valid =
      invitation.status === "PENDING" && invitation.expiresAt > new Date();
    return {
      companyName: invitation.employer.companyName,
      role: invitation.role,
      email: invitation.email,
      valid,
    };
  }

  async acceptInvitation(
    user: AuthenticatedUser,
    dto: AcceptInvitationDto,
  ): Promise<TeamMember> {
    const invitation = await this.teamRepository.findInvitationByToken(
      dto.token,
    );
    if (
      !invitation ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt < new Date()
    ) {
      throw new BadRequestApiException(
        "Invalid or expired invitation",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    // Never trust who's clicking — the token is only proof someone has the
    // link, not proof they're the intended recipient. Requiring the
    // authenticated caller's own email to match is what stops a forwarded
    // link from being accepted by the wrong account.
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenApiException(
        "This invitation was sent to a different email address",
        ErrorCode.TEAM_INVITATION_EMAIL_MISMATCH,
      );
    }

    const existingMembership =
      await this.companyMembershipService.resolveMembership(user.id);
    if (existingMembership) {
      throw new ConflictApiException(
        "You already belong to a company",
        ErrorCode.ALREADY_COMPANY_MEMBER,
      );
    }

    const accepted = await this.teamRepository.acceptInvitation(
      invitation.id,
      user.id,
      invitation.employerId,
      invitation.role,
    );
    if (!accepted) {
      throw new BadRequestApiException(
        "Invalid or expired invitation",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    const membership = await this.companyMembershipService.resolveMembership(
      user.id,
    );
    assertFound(membership);
    const members = await this.teamRepository.findMembersByCompany(
      membership.employerId,
    );
    const created = members.find((m) => m.userId === user.id);
    assertFound(created);
    return created;
  }

  async updateMemberRole(
    member: { id: string; employerId: string; role: string },
    dto: UpdateMemberRoleDto,
    actingUserId: string,
  ): Promise<TeamMember> {
    // Hand-over of the company (PB39 AC3): the acting owner must confirm with
    // their password, then the chosen member becomes OWNER and the previous
    // owner steps down to RECRUITER. Accounts that sign in only through OAuth
    // have no password to re-enter, so for them the explicit request suffices.
    if (dto.role === "OWNER" && member.role !== "OWNER") {
      const actor = await this.teamRepository.findPasswordHash(actingUserId);
      if (actor?.passwordHash) {
        const valid =
          !!dto.password &&
          (await bcrypt.compare(dto.password, actor.passwordHash));
        if (!valid) {
          throw new BadRequestApiException(
            "Current password is incorrect",
            ErrorCode.CURRENT_PASSWORD_INCORRECT,
          );
        }
      }
      return this.teamRepository.transferOwnership(
        member.id,
        actingUserId,
        member.employerId,
      );
    }

    if (member.role === "OWNER" && dto.role !== "OWNER") {
      const ownerCount = await this.teamRepository.countOwners(
        member.employerId,
      );
      if (ownerCount <= 1) {
        throw new BadRequestApiException(
          "A company must always have at least one owner",
          ErrorCode.CANNOT_REMOVE_LAST_OWNER,
        );
      }
    }
    return this.teamRepository.updateRole(member.id, dto.role);
  }

  async removeMember(member: {
    id: string;
    employerId: string;
    role: string;
  }): Promise<void> {
    if (member.role === "OWNER") {
      const ownerCount = await this.teamRepository.countOwners(
        member.employerId,
      );
      if (ownerCount <= 1) {
        throw new BadRequestApiException(
          "A company must always have at least one owner",
          ErrorCode.CANNOT_REMOVE_LAST_OWNER,
        );
      }
    }
    await this.teamRepository.removeMember(member.id);
  }
}
