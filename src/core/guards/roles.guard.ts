import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { UserRole } from "@prisma/client";
import { ROLES_KEY } from "@/core/decorators/roles.decorator";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

/** Must run after JwtAuthGuard so request.user is populated. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenApiException();
    }
    return true;
  }
}
