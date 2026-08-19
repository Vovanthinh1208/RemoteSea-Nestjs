import {
  APPLICATION_REVIEW_ROLES,
  hasCompanyRole,
  JOB_MANAGEMENT_ROLES,
  OWNER_ONLY,
  requireCompanyRole,
} from "./company-role.util";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

describe("hasCompanyRole", () => {
  it("is false for no membership at all", () => {
    expect(hasCompanyRole(null, OWNER_ONLY)).toBe(false);
  });

  it("is false when the membership's role isn't in the allowed set", () => {
    expect(
      hasCompanyRole(
        { employerId: "c1", role: "INTERVIEWER" },
        JOB_MANAGEMENT_ROLES,
      ),
    ).toBe(false);
  });

  it("is true when the membership's role is in the allowed set", () => {
    expect(
      hasCompanyRole(
        { employerId: "c1", role: "HIRING_MANAGER" },
        APPLICATION_REVIEW_ROLES,
      ),
    ).toBe(true);
  });
});

describe("requireCompanyRole", () => {
  it("throws COMPANY_MEMBERSHIP_REQUIRED for no membership", () => {
    const error = (() => {
      try {
        requireCompanyRole(null, OWNER_ONLY);
        return undefined;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.COMPANY_MEMBERSHIP_REQUIRED,
    });
  });

  it("throws INSUFFICIENT_COMPANY_ROLE for a role outside the allowed set", () => {
    const error = (() => {
      try {
        requireCompanyRole(
          { employerId: "c1", role: "INTERVIEWER" },
          JOB_MANAGEMENT_ROLES,
        );
        return undefined;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.INSUFFICIENT_COMPANY_ROLE,
    });
  });

  it("returns the membership unchanged when the role is allowed", () => {
    const membership = { employerId: "c1", role: "RECRUITER" } as const;
    expect(requireCompanyRole(membership, JOB_MANAGEMENT_ROLES)).toBe(
      membership,
    );
  });
});
