import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { CompanyMemberRole, UserRole } from "@prisma/client";
import {
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { PrismaService } from "@/core/database/prisma.service";
import type { CompanyMembership } from "@/modules/company/company-membership.interfaces";
import { OWNED_RESOURCE_REQUEST_KEY } from "./ownership.guard";

export const COMPANY_MEMBERSHIP_REQUEST_KEY = "companyMembership";

export type { CompanyMembership };

type RequestWithUser = Request & { user: AuthenticatedUser };
type RequestWithResource = Request & Record<string, unknown>;

/**
 * Multi-seat twin of OwnershipGuardBase: instead of "does the resource's
 * single owning userId equal mine" (a scalar ===), this resolves the
 * caller's CompanyMember row and checks (a) it belongs to the *same*
 * company as the resource, and (b) their role is one of allowedRoles for
 * this route — or, failing that, (c) they're the resource's specific
 * assignee (see getAssignedUserId; INTERVIEWER's whole access model is
 * "assigned only", not a role in allowedRoles at all for most routes).
 *
 * The membership lookup itself (unlike resource loading) is identical for
 * every subclass, so — unlike OwnershipGuardBase, which leaves everything
 * abstract — this class owns that one query directly via an injected
 * PrismaService rather than the shared CompanyMembershipRepository
 * (modules/company): guards already sit below the module layer that
 * repository lives in, and this is the same one-line query either way —
 * inlining it here avoids a guard base class in common/ depending on a
 * feature-adjacent module for a single findUnique.
 */
@Injectable()
export abstract class CompanyOwnershipGuardBase<T> implements CanActivate {
  /** Account-level roles that bypass the company check entirely (e.g. ["ADMIN"]). */
  protected readonly bypassAccountRoles: UserRole[] = [];
  protected readonly notFoundOnMismatch: boolean = false;
  protected readonly notFoundMessage: string = "Not found";
  protected readonly forbiddenMessage: string = "Forbidden";
  protected readonly notFoundCode: ErrorCode = ErrorCode.NOT_FOUND;
  protected readonly forbiddenCode: ErrorCode =
    ErrorCode.INSUFFICIENT_COMPANY_ROLE;

  /** Company roles with baseline access to this resource/route. */
  protected abstract readonly allowedRoles: readonly CompanyMemberRole[];

  constructor(private readonly prisma: PrismaService) {}

  protected abstract loadResource(
    resourceId: string,
    request: Request,
  ): Promise<T | null>;

  protected abstract getCompanyId(resource: T): string;

  /**
   * The one userId who can access this specific resource despite not
   * meeting allowedRoles — e.g. Interview.interviewerId. Returns null (no
   * such concept) by default; only override where an assignment actually
   * exists.
   */
  protected getAssignedUserId(_resource: T): string | null {
    return null;
  }

  protected extractResourceId(request: Request): string {
    const id = request.params.id;
    return (Array.isArray(id) ? id[0] : id) ?? "";
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithUser & RequestWithResource>();

    const resourceId = this.extractResourceId(request);
    const resource = await this.loadResource(resourceId, request);
    if (!resource) {
      throw new NotFoundApiException(this.notFoundMessage, this.notFoundCode);
    }

    if (this.bypassAccountRoles.includes(request.user.role)) {
      request[OWNED_RESOURCE_REQUEST_KEY] = resource;
      return true;
    }

    const companyId = this.getCompanyId(resource);
    const membership = await this.prisma.companyMember.findUnique({
      where: { userId: request.user.id },
      select: {
        employerId: true,
        role: true,
        employer: { select: { suspendedAt: true } },
      },
    });

    const isSameCompany = membership?.employerId === companyId;
    // Checked ahead of role/assignment below — a suspended company's own
    // assigned INTERVIEWER shouldn't retain access just because they're not
    // gated by allowedRoles the same way OWNER/RECRUITER/HIRING_MANAGER are.
    if (isSameCompany && membership.employer.suspendedAt) {
      throw new ForbiddenApiException(
        "Your company's account has been suspended. Contact support for help.",
        ErrorCode.COMPANY_SUSPENDED,
      );
    }
    const hasBaselineAccess =
      isSameCompany && this.allowedRoles.includes(membership.role);
    const isAssigned =
      isSameCompany && this.getAssignedUserId(resource) === request.user.id;

    if (!hasBaselineAccess && !isAssigned) {
      if (this.notFoundOnMismatch) {
        throw new NotFoundApiException(this.notFoundMessage, this.notFoundCode);
      }
      throw new ForbiddenApiException(
        this.forbiddenMessage,
        this.forbiddenCode,
      );
    }

    request[OWNED_RESOURCE_REQUEST_KEY] = resource;
    if (membership) {
      // Reaching here means the suspension check above already passed (it
      // throws otherwise), so this is always null — flattened to match
      // CompanyMembership's shape for CurrentCompanyMembership consumers.
      request[COMPANY_MEMBERSHIP_REQUEST_KEY] = {
        employerId: membership.employerId,
        role: membership.role,
        suspendedAt: membership.employer.suspendedAt,
      };
    }
    return true;
  }
}
