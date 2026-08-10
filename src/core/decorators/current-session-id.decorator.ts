import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

// JwtStrategy.validate attaches `sid` alongside the usual AuthenticatedUser
// fields onto request.user (see jwt.strategy.ts) — this decorator is the only
// place that reads it back out, for the handful of routes (Active sessions
// list/revoke) that need to know "which session is this request's own."
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: { sid: string } }>();
    return request.user.sid;
  },
);
