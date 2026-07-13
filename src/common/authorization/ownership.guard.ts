import { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { UserRole } from "@prisma/client";
import {
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

export const OWNED_RESOURCE_REQUEST_KEY = "ownedResource";

type RequestWithUser = Request & { user: AuthenticatedUser };
type RequestWithResource = Request & Record<string, unknown>;

/**
 * Shared "does the current user own the resource this route operates on" check,
 * replacing the fetch-entity/compare-userId/throw boilerplate that used to be
 * hand-rolled per service method (jobs.update, employer.listJobApplications,
 * employer.updateApplication, billing.createCheckoutSession all did this
 * independently, with small inconsistencies in which exception they threw).
 *
 * Must run after JwtAuthGuard (needs request.user already populated). On success,
 * the loaded resource is attached to the request so the controller can retrieve it
 * via @CurrentResource() and pass it into the service — the service then never has
 * to re-fetch the same row just to re-derive what the guard already confirmed.
 */
export abstract class OwnershipGuardBase<T> implements CanActivate {
  /** Roles that bypass the ownership check entirely (e.g. ["ADMIN"]). Empty = no bypass. */
  protected readonly bypassRoles: UserRole[] = [];
  /**
   * Throw 404 instead of 403 when the resource exists but isn't owned by this
   * user — for routes where confirming "this id exists" to a non-owner is itself
   * an information leak (e.g. billing/checkout).
   */
  protected readonly notFoundOnMismatch: boolean = false;
  protected readonly notFoundMessage: string = "Not found";
  protected readonly forbiddenMessage: string = "Forbidden";

  protected abstract loadResource(
    resourceId: string,
    request: Request,
  ): Promise<T | null>;

  protected abstract getOwnerUserId(resource: T): string;

  /** Default: read from the route's :id param. Override to read from elsewhere (e.g. body). */
  protected extractResourceId(request: Request): string {
    const id = request.params.id;
    return Array.isArray(id) ? id[0] : id;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithUser & RequestWithResource>();

    const resourceId = this.extractResourceId(request);
    const resource = await this.loadResource(resourceId, request);
    if (!resource) {
      throw new NotFoundApiException(this.notFoundMessage);
    }

    const isOwner = this.getOwnerUserId(resource) === request.user.id;
    const isBypassed = this.bypassRoles.includes(request.user.role);
    if (!isOwner && !isBypassed) {
      if (this.notFoundOnMismatch) {
        throw new NotFoundApiException(this.notFoundMessage);
      }
      throw new ForbiddenApiException(this.forbiddenMessage);
    }

    request[OWNED_RESOURCE_REQUEST_KEY] = resource;
    return true;
  }
}
