import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import type { CompanyMembership } from "./company-membership.interfaces";

@Injectable()
export class CompanyMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(userId: string): Promise<CompanyMembership | null> {
    const row = await this.prisma.companyMember.findUnique({
      where: { userId },
      select: {
        employerId: true,
        role: true,
        employer: { select: { suspendedAt: true } },
      },
    });
    if (!row) return null;
    return {
      employerId: row.employerId,
      role: row.role,
      suspendedAt: row.employer.suspendedAt,
    };
  }
}
