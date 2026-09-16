import type { Request, Response } from "express";
import { applyOAuthStateCheck } from "./oauth-state.util";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const makeRequest = (
  query: Record<string, unknown>,
  cookieHeader?: string,
): Request =>
  ({
    query,
    headers: { cookie: cookieHeader },
  }) as unknown as Request;

const makeResponse = () => {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  return { cookie, clearCookie } as unknown as Response & {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };
};

const noLinkIntent = () => false;

describe("applyOAuthStateCheck", () => {
  it("on the initial leg (no code yet), mints a nonce, sets it as a cookie, and returns it as state", () => {
    const request = makeRequest({});
    const response = makeResponse();

    const result = applyOAuthStateCheck(request, response, noLinkIntent);

    expect(result?.state).toMatch(/^[0-9a-f]{64}$/);
    expect(response.cookie).toHaveBeenCalledWith(
      "oauth_state",
      result?.state,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });

  it("on the callback leg, accepts a state that matches the nonce cookie and clears the cookie", () => {
    const request = makeRequest(
      { code: "auth-code", state: "abc123" },
      "oauth_state=abc123",
    );
    const response = makeResponse();

    expect(() =>
      applyOAuthStateCheck(request, response, noLinkIntent),
    ).not.toThrow();
    expect(response.clearCookie).toHaveBeenCalledWith(
      "oauth_state",
      expect.any(Object),
    );
  });

  it("rejects a callback whose state doesn't match the nonce cookie", () => {
    const request = makeRequest(
      { code: "auth-code", state: "forged-state" },
      "oauth_state=abc123",
    );
    const response = makeResponse();

    const error = (() => {
      try {
        applyOAuthStateCheck(request, response, noLinkIntent);
        return undefined;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(UnauthorizedApiException);
    expect((error as UnauthorizedApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_OAUTH_STATE,
    });
  });

  it("rejects a callback with no cookie at all (e.g. a forged request with no prior redirect leg)", () => {
    const request = makeRequest({ code: "auth-code", state: "anything" });
    const response = makeResponse();

    expect(() => applyOAuthStateCheck(request, response, noLinkIntent)).toThrow(
      UnauthorizedApiException,
    );
  });

  // GET /auth/:provider/link builds its own authorization URL directly and
  // never goes through this guard's redirect leg, so it has no nonce cookie
  // — its signed link-intent JWT is its own, separate proof, verified by
  // the caller-supplied predicate instead of the cookie.
  it("accepts a callback with no cookie when the state is a valid link intent", () => {
    const request = makeRequest({
      code: "auth-code",
      state: "signed-link-jwt",
    });
    const response = makeResponse();

    expect(() =>
      applyOAuthStateCheck(
        request,
        response,
        (state) => state === "signed-link-jwt",
      ),
    ).not.toThrow();
  });
});
