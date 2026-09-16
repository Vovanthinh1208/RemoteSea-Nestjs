import * as crypto from "crypto";
import type { Request, Response } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const prefix = `${name}=`;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function applyOAuthStateCheck(
  request: Request,
  response: Response,
  isLinkIntent: (state: string) => boolean,
): { state: string } | undefined {
  if (typeof request.query.code !== "string") {
    const nonce = crypto.randomBytes(32).toString("hex");
    response.cookie(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_STATE_TTL_MS,
      path: "/auth",
    });
    return { state: nonce };
  }

  const cookieNonce = readCookie(request, OAUTH_STATE_COOKIE);
  response.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth" });
  const queryState = request.query.state;

  if (typeof queryState === "string" && isLinkIntent(queryState)) {
    return undefined;
  }

  if (
    !cookieNonce ||
    typeof queryState !== "string" ||
    !timingSafeEqual(queryState, cookieNonce)
  ) {
    throw new UnauthorizedApiException(
      "OAuth state mismatch — please try signing in again",
      ErrorCode.INVALID_OAUTH_STATE,
    );
  }
  return undefined;
}
