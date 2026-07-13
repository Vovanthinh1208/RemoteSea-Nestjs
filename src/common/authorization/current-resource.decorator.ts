import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { OWNED_RESOURCE_REQUEST_KEY } from "./ownership.guard";

/** Retrieves the resource an OwnershipGuardBase subclass already loaded and authorized. */
export const CurrentResource = createParamDecorator(
  <T>(_data: unknown, ctx: ExecutionContext): T => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & Record<string, unknown>>();
    return request[OWNED_RESOURCE_REQUEST_KEY] as T;
  },
);
