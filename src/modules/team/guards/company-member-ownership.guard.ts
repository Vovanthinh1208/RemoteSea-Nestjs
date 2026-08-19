import { Injectable } from "@nestjs/common";
import { CompanyOwnershipGuardBase } from "@/common/authorization/company-ownership.guard";
import { OWNER_ONLY } from "@/common/authorization/company-role.util";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { PrismaService } from "@/core/database/prisma.service";
import { TeamRepository } from "../team.repository";
import type { MemberForOwnership } from "../interfaces";

/** Guards PATCH/DELETE /team/members/:id — only the target's own company OWNER. */
@Injectable()
export class CompanyMemberOwnershipGuard extends CompanyOwnershipGuardBase<MemberForOwnership> {
  protected readonly allowedRoles = OWNER_ONLY;
  protected override readonly notFoundCode = ErrorCode.COMPANY_MEMBER_NOT_FOUND;

  constructor(
    prisma: PrismaService,
    private readonly teamRepository: TeamRepository,
  ) {
    super(prisma);
  }

  protected loadResource(id: string): Promise<MemberForOwnership | null> {
    return this.teamRepository.findMemberById(id);
  }

  protected getCompanyId(member: MemberForOwnership): string {
    return member.employerId;
  }
}
