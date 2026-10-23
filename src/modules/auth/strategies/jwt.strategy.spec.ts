import type { AuthRepository } from "../auth.repository";
import type { JwtPayload } from "@/common/interfaces/authenticated-user.interface";
import { JwtStrategy } from "./jwt.strategy";

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
