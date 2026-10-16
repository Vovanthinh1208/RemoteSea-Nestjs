import { Injectable } from "@nestjs/common";
import type { CompanyMemberRole } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  memberOwnershipSelect,
  pendingInvitationSelect,
  teamMemberSelect,
  type MemberForOwnership,
  type PendingInvitation,
  type TeamMember,
} from "./interfaces";

@Injectable()
export class TeamRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMembersByCompany(employerId: string): Promise<TeamMember[]> {
    return this.prisma.companyMember.findMany({
      where: { employerId },
      orderBy: { createdAt: "asc" },
      select: teamMemberSelect,
    });
  }

  findMemberById(id: string): Promise<MemberForOwnership | null> {
    return this.prisma.companyMember.findUnique({
      where: { id },
      select: memberOwnershipSelect,
    });
  }

  countOwners(employerId: string): Promise<number> {
    return this.prisma.companyMember.count({
      where: { employerId, role: "OWNER" },
    });
  }

  updateRole(id: string, role: CompanyMemberRole): Promise<TeamMember> {
    return this.prisma.companyMember.update({
      where: { id },
      data: { role },
      select: teamMemberSelect,
    });
  }

  findPasswordHash(
    userId: string,
  ): Promise<{ passwordHash: string | null } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
  }

  // PB39 AC3.3: one transaction, so the company can never be seen with zero or
  // two owners half-way through a hand-over.
  async transferOwnership(
    targetMemberId: string,
    previousOwnerUserId: string,
    employerId: string,
  ): Promise<TeamMember> {
    return this.prisma.$transaction(async (tx) => {
      await tx.companyMember.updateMany({
        where: { employerId, userId: previousOwnerUserId, role: "OWNER" },
        data: { role: "RECRUITER" },
      });
      return tx.companyMember.update({
        where: { id: targetMemberId },
        data: { role: "OWNER" },
        select: teamMemberSelect,
      });
    });
  }

  async removeMember(id: string): Promise<void> {
    await this.prisma.companyMember.delete({ where: { id } });
  }

  findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  findCompanyName(employerId: string): Promise<{ companyName: string } | null> {
    return this.prisma.employerProfile.findUnique({
      where: { id: employerId },
      select: { companyName: true },
    });
  }

  findPendingInvitationByEmail(employerId: string, email: string) {
    return this.prisma.teamInvitation.findFirst({
      where: { employerId, email, status: "PENDING" },
      select: { id: true },
    });
  }

  createInvitation(data: {
    employerId: string;
    email: string;
    role: CompanyMemberRole;
    token: string;
    invitedById: string;
    expiresAt: Date;
  }) {
    return this.prisma.teamInvitation.create({ data });
  }

  findPendingInvitationsByCompany(
    employerId: string,
  ): Promise<PendingInvitation[]> {
    return this.prisma.teamInvitation.findMany({
      where: { employerId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: pendingInvitationSelect,
    });
  }

  findInvitationById(id: string) {
    return this.prisma.teamInvitation.findUnique({ where: { id } });
  }

  async revokeInvitation(id: string): Promise<void> {
    await this.prisma.teamInvitation.update({
      where: { id },
      data: { status: "REVOKED", respondedAt: new Date() },
    });
  }

  findInvitationByToken(token: string) {
    return this.prisma.teamInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        employerId: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        employer: { select: { companyName: true } },
      },
    });
  }

  // CAS on status: PENDING -> ACCEPTED, plus the new CompanyMember row, in
  // one transaction. Two concurrent accepts of the same token (double-click,
  // replayed link) can't both succeed — the second updateMany matches 0 rows.
  // The CompanyMember insert's own userId @unique is the second, independent
  // backstop (also blocks a user who's *already* a member elsewhere). Also
  // promotes the accepting user's account role to EMPLOYER, same as
  // EmployerRepository.createProfileForUser does for a company's original
  // creator — every existing employer-side route gates on @Roles("EMPLOYER"),
  // so a team member joining as a TALENT-role account would otherwise be
  // unable to reach any of them despite a valid CompanyMember row.
  async acceptInvitation(
    invitationId: string,
    userId: string,
    employerId: string,
    role: CompanyMemberRole,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.teamInvitation.updateMany({
        where: { id: invitationId, status: "PENDING" },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      if (count === 0) return false;

      await tx.companyMember.create({ data: { userId, employerId, role } });
      await tx.user.update({
        where: { id: userId },
        data: { role: "EMPLOYER" },
      });
      return true;
    });
  }
}
