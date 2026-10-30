import type { AuthRepository } from "../auth.repository";
import type { JwtPayload } from "@/common/interfaces/authenticated-user.interface";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import {
  ServiceUnavailableApiException,
  UnauthorizedApiException,
} from "@/common/exceptions/api.exception";

describe("JwtStrategy session revocation", () => {
  const payload: JwtPayload = {
    sub: "deleted-user",
    email: "person@example.com",
    name: "Person",
    role: "TALENT",
    sid: "deleted-session",
  };

  it("rejects an old access token after account deletion cascades its session", async () => {
    const findSessionState = jest.fn().mockResolvedValue(null);
    const strategy = new JwtStrategy(
      { get: () => "test-secret" } as never,
      { findSessionState } as unknown as AuthRepository,
    );

    await expect(strategy.validate(payload)).rejects.toThrow(
      "Session expired — please sign in again",
    );
    expect(findSessionState).toHaveBeenCalledWith("deleted-session");
  });

  it("rejects a previously revoked session", async () => {
    const findSessionState = jest.fn().mockResolvedValue({
      id: "deleted-session",
      userId: "deleted-user",
      revokedAt: new Date(),
      lastSeenAt: new Date(),
    });
    const strategy = new JwtStrategy(
      { get: () => "test-secret" } as never,
      { findSessionState } as unknown as AuthRepository,
    );

    await expect(strategy.validate(payload)).rejects.toThrow(
      "Session expired — please sign in again",
    );
  });

  it("accepts an existing active session", async () => {
    const findSessionState = jest.fn().mockResolvedValue({
      id: "active-session",
      userId: "active-user",
      revokedAt: null,
      lastSeenAt: new Date(),
    });
    const strategy = new JwtStrategy(
      { get: () => "test-secret" } as never,
      { findSessionState } as unknown as AuthRepository,
    );

    await expect(
      strategy.validate({
        ...payload,
        sub: "active-user",
        sid: "active-session",
      }),
    ).resolves.toMatchObject({ id: "active-user", sid: "active-session" });
  });
});

// A database failure while reading the session must not look like an expired
// session: the web client signs the user out on any 401.
describe("JwtStrategy / JwtAuthGuard when the session lookup fails", () => {
  const payload: JwtPayload = {
    sub: "user-1",
    email: "person@example.com",
    name: "Person",
    role: "TALENT",
    sid: "session-1",
  };

  it("answers 503 (not 401) when the database can't be reached", async () => {
    const findSessionState = jest
      .fn()
      .mockRejectedValue(new Error("Timed out fetching a new connection"));
    const strategy = new JwtStrategy(
      { get: () => "test-secret" } as never,
      { findSessionState } as unknown as AuthRepository,
    );

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      ServiceUnavailableApiException,
    );
  });

  it("the guard keeps a non-401 HTTP error's status", () => {
    const guard = new JwtAuthGuard();
    const outage = new ServiceUnavailableApiException();
    expect(() => guard.handleRequest(outage, false)).toThrow(outage);
  });

  it("the guard still answers 401 for a rejected or missing session", () => {
    const guard = new JwtAuthGuard();
    expect(() =>
      guard.handleRequest(
        new Error("Session expired — please sign in again"),
        false,
      ),
    ).toThrow(UnauthorizedApiException);
    expect(() => guard.handleRequest(null, false)).toThrow(
      UnauthorizedApiException,
    );
  });
});
