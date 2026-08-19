import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import {
  COMPANY_MEMBERSHIP_REQUEST_KEY,
  type CompanyMembership,
} from "./company-ownership.guard";

/** Retrieves the caller's CompanyMember row a CompanyOwnershipGuardBase subclass already resolved. */
export const CurrentCompanyMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CompanyMembership | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & Record<string, unknown>>();
    return request[COMPANY_MEMBERSHIP_REQUEST_KEY] as
      CompanyMembership | undefined;
  },
);
