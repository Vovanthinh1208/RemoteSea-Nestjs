import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import type { CompanyMembership } from "./company-membership.interfaces";

@Injectable()
export class CompanyMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMembership(userId: string): Promise<CompanyMembership | null> {
    return this.prisma.companyMember.findUnique({
      where: { userId },
      select: { employerId: true, role: true },
    });
  }
}
