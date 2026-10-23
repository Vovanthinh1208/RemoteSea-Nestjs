/** Run explicitly with --config jest-account-deletion.config.cjs against an
 * isolated local database (ACCOUNT_DELETION_TEST_DATABASE_URL, which must be
 * a localhost remotesea_authdel_* database).
 *
 * PB20 account deletion vs. every supported sign-in method (email/password,
 * Google, GitHub, LinkedIn). Real Nest routes, JWT/session guards, the real
 * OAuth callback + exchange controller, Prisma repositories and PostgreSQL.
 *
 * Stubbed: outbound email, rate limiting, and ONLY the provider handshake of
 * the three OAuth guards — the stub hands the callback route the same
 * OAuthProfile the real strategy produces after its verified-email check
 * (that check is covered separately by oauth-strategy-validation.spec.ts).
 * This suite therefore does NOT prove anything about Google/GitHub/LinkedIn's
 * own consent screens.
 *
 * Policy under test (PB20 + PB04 §4.3, confirmed by the product owner):
 * deletion is permanent; signing in again afterwards may create a FRESH
 * account (new id, no inherited data), but must never restore the deleted
 * one or let anything issued to it keep working.
 */
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import type { ExecutionContext, INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "@/core/database/prisma.service";
import { GlobalExceptionFilter } from "@/core/filters/global-exception.filter";
import { EmailService } from "@/common/services/email.service";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { AuthService } from "@/modules/auth/auth.service";
import { GoogleAuthGuard } from "@/modules/auth/guards/google-auth.guard";
import { GithubAuthGuard } from "@/modules/auth/guards/github-auth.guard";
import { LinkedinAuthGuard } from "@/modules/auth/guards/linkedin-auth.guard";
import type { OAuthProviderName } from "@/modules/auth/interfaces";
// supertest has no @types in this repository; its runtime API is used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require("supertest");

type Provider = OAuthProviderName;
type Method = "password" | Provider;
type Identity = { id: string; token: string };

const PROVIDERS: Provider[] = ["google", "github", "linkedin"];
const METHODS: Method[] = ["password", ...PROVIDERS];
const PASSWORD = "Correct-horse-9";
const FRONTEND_URL = "http://frontend.invalid";
const PROFILE_HEADER = "x-test-oauth-profile";

let app: INestApplication;
let db: PrismaService;
let auth: AuthService;
const sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);
const email = {
  ...Object.fromEntries(
    Object.getOwnPropertyNames(EmailService.prototype)
      .filter((name) => name !== "constructor")
      .map((name) => [name, jest.fn().mockResolvedValue(undefined)]),
  ),
  sendPasswordResetEmail,
};

const providerHandshake = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers[PROFILE_HEADER];
    if (typeof raw !== "string") return false;
    req.user = JSON.parse(raw);
    return true;
  },
};

const server = () => app.getHttpServer();
const newEmail = (tag: string) =>
  `${tag}-${randomUUID().slice(0, 8)}@example.invalid`;
const subject = () => randomUUID();
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(address: string): Promise<Identity> {
  const res = await request(server())
    .post("/auth/register")
    .send({
      name: "Deletion QA",
      email: address,
      password: PASSWORD,
      role: "TALENT",
    })
    .expect(201);
  return { id: res.body.user.id, token: res.body.accessToken };
}

function passwordLogin(address: string) {
  return request(server())
    .post("/auth/login")
    .send({ email: address, password: PASSWORD });
}

// Runs the real GET /auth/:provider/callback handler, then redeems the
// exchange code exactly like the web /auth/callback page does.
async function oauthCallback(
  provider: Provider,
  providerAccountId: string,
  address: string,
  state?: string,
) {
  const profile = {
    provider,
    providerAccountId,
    email: address,
    name: "Deletion QA",
    image: null,
  };
  return request(server())
    .get(`/auth/${provider}/callback`)
    .query(state ? { state } : {})
    .set(PROFILE_HEADER, JSON.stringify(profile))
    .expect(302);
}

async function oauthCode(provider: Provider, sub: string, address: string) {
  const res = await oauthCallback(provider, sub, address);
  const location = new URL(res.headers.location);
  expect(location.pathname).toBe("/auth/callback");
  return location.searchParams.get("code") as string;
}

async function oauthLogin(
  provider: Provider,
  sub: string,
  address: string,
): Promise<Identity> {
  const code = await oauthCode(provider, sub, address);
  const res = await request(server())
    .post("/auth/oauth/exchange")
    .send({ code })
    .expect(200);
  return { id: res.body.user.id, token: res.body.accessToken };
}

async function signIn(
  method: Method,
  address: string,
  subs: Record<Provider, string>,
) {
  return method === "password"
    ? register(address)
    : oauthLogin(method, subs[method], address);
}

function deleteMe(token: string, password?: string) {
  return request(server())
    .delete("/users/me")
    .set(bearer(token))
    .send({ confirmation: "DELETE", ...(password && { password }) });
}

// Seeds private data the deleted account owns, so "fresh account" can be
// checked for not inheriting any of it.
async function seedPrivateData(userId: string) {
  await db.notification.create({
    data: {
      userId,
      type: "MESSAGE_RECEIVED",
      title: "private marker",
      body: "must not survive deletion",
    },
  });
}

async function expectGone(userId: string) {
  expect(await db.user.findUnique({ where: { id: userId } })).toBeNull();
  expect(await db.session.count({ where: { userId } })).toBe(0);
  expect(await db.account.count({ where: { userId } })).toBe(0);
  expect(await db.notification.count({ where: { userId } })).toBe(0);
  expect(await db.talentProfile.count({ where: { userId } })).toBe(0);
}

async function expectTokenRejected(token: string) {
  const h = bearer(token);
  await request(server()).get("/auth/me").set(h).expect(401);
  await request(server()).get("/users/me/account").set(h).expect(401);
  await request(server()).get("/users/me/export").set(h).expect(401);
  await request(server()).get("/users/me/sessions").set(h).expect(401);
  await request(server())
    .patch("/users/me")
    .set(h)
    .send({ name: "Resurrected" })
    .expect(401);
  await deleteMe(token).expect(401);
  const session = await request(server())
    .get("/auth/session")
    .set(h)
    .expect(200);
  expect(session.body.user).toBeNull();
}

async function expectFresh(fresh: Identity, deletedId: string) {
  expect(fresh.id).not.toBe(deletedId);
  expect(await db.notification.count({ where: { userId: fresh.id } })).toBe(0);
  const me = await request(server())
    .get("/auth/me")
    .set(bearer(fresh.token))
    .expect(200);
  expect(me.body.id).toBe(fresh.id);
}

beforeAll(async () => {
  const url = new URL(process.env.ACCOUNT_DELETION_TEST_DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !/^\/remotesea_authdel_[a-z0-9_]+$/.test(url.pathname)
  ) {
    throw new Error(
      "ACCOUNT_DELETION_TEST_DATABASE_URL must target an isolated local remotesea_authdel_* database",
    );
  }
  process.env.DATABASE_URL = url.toString();
  process.env.AUTH_SECRET = "isolated-account-deletion-test-signing-secret";
  process.env.NODE_ENV = "test";
  process.env.FRONTEND_URL = FRONTEND_URL;
  for (const name of [
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
    "AUTH_LINKEDIN_ID",
    "AUTH_LINKEDIN_SECRET",
    "STRIPE_SECRET_KEY",
    "MAIL_HOST",
    "MAIL_PORT",
    "MAIL_SECURE",
    "MAIL_USER",
    "MAIL_PASSWORD",
    "MAIL_FROM",
    "S3_BUCKET",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "AI_SERVICE_SECRET",
    "SENTRY_DSN",
  ])
    process.env[name] = "";
  const forRoot = ConfigModule.forRoot.bind(ConfigModule);
  const configSpy = jest
    .spyOn(ConfigModule, "forRoot")
    .mockImplementation((options) =>
      forRoot({ ...options, ignoreEnvFile: true }),
    );
  const { AppModule } = await import("@/app.module");
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue(email)
    .overrideProvider(RateLimitService)
    .useValue({
      enforce: () => undefined,
      check: () => ({ allowed: true, remaining: 1, retryAfter: 0 }),
    })
    .overrideGuard(GoogleAuthGuard)
    .useValue(providerHandshake)
    .overrideGuard(GithubAuthGuard)
    .useValue(providerHandshake)
    .overrideGuard(LinkedinAuthGuard)
    .useValue(providerHandshake)
    .compile();
  configSpy.mockRestore();
  app = mod.createNestApplication();
  app.useLogger(false);
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  db = app.get(PrismaService);
  auth = app.get(AuthService);
  // Belt and braces: never run destructive deletes anywhere but the
  // isolated database named above.
  const rows = await db.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  expect(rows[0]?.current_database).toBe(url.pathname.slice(1));
}, 120_000);

afterAll(async () => {
  if (app) await app.close();
});

describe("deleted account vs. every sign-in method", () => {
  // Every (method before deletion) × (method after deletion) pair.
  const pairs = METHODS.flatMap((before) =>
    METHODS.map((after) => [before, after] as const),
  );

  it.each(pairs)(
    "AD-MATRIX %s → delete → %s: old account stays deleted; any new sign-in is a fresh account",
    async (before, after) => {
      const address = newEmail(`${before}-${after}`);
      const subs = {
        google: subject(),
        github: subject(),
        linkedin: subject(),
      };
      const original = await signIn(before, address, subs);
      await seedPrivateData(original.id);

      await deleteMe(
        original.token,
        before === "password" ? PASSWORD : undefined,
      ).expect(200, { success: true });
      await expectGone(original.id);
      await expectTokenRejected(original.token);

      if (after === "password") {
        // The deleted password no longer authenticates anything…
        const login = await passwordLogin(address).expect(401);
        expect(login.body.code).toBe("INVALID_CREDENTIALS");
        // …and re-registering is a brand-new signup (PB01).
        await expectFresh(await register(address), original.id);
      } else {
        // Same provider subject as before (when before === after) or a
        // different provider with the same verified email.
        await expectFresh(
          await oauthLogin(after, subs[after], address),
          original.id,
        );
      }
    },
  );

  it("AD-MULTI account with password + Google + GitHub + LinkedIn linked: every identity is removed, re-entry by any provider is one fresh account", async () => {
    const address = newEmail("multi");
    const subs = { google: subject(), github: subject(), linkedin: subject() };
    const original = await register(address);
    for (const provider of PROVIDERS) {
      const state = auth.createOAuthLinkIntent(original.id, provider);
      const res = await oauthCallback(provider, subs[provider], address, state);
      expect(res.headers.location).toBe(
        `${FRONTEND_URL}/settings?connected=${provider}`,
      );
    }
    // A second device, to prove every session goes, not just the caller's.
    const otherDevice = await passwordLogin(address).expect(200);
    expect(await db.account.count({ where: { userId: original.id } })).toBe(3);
    await seedPrivateData(original.id);

    await deleteMe(original.token, PASSWORD).expect(200);
    await expectGone(original.id);
    expect(
      await db.account.count({
        where: { providerAccountId: { in: Object.values(subs) } },
      }),
    ).toBe(0);
    await expectTokenRejected(original.token);
    await expectTokenRejected(otherDevice.body.accessToken);

    const fresh: Identity[] = [];
    for (const p of PROVIDERS)
      fresh.push(await oauthLogin(p, subs[p], address));
    expect(new Set(fresh.map((f) => f.id)).size).toBe(1);
    for (const f of fresh) await expectFresh(f, original.id);
  });

  it("AD-OTHER deleting one account does not affect a different user, nor an identity with a different email", async () => {
    const victimEmail = newEmail("victim");
    const bystanderEmail = newEmail("bystander");
    const victim = await oauthLogin("google", subject(), victimEmail);
    const bystanderSub = subject();
    const bystander = await oauthLogin("github", bystanderSub, bystanderEmail);
    await seedPrivateData(bystander.id);

    await deleteMe(victim.token).expect(200);

    await request(server())
      .get("/auth/me")
      .set(bearer(bystander.token))
      .expect(200);
    const again = await oauthLogin("github", bystanderSub, bystanderEmail);
    expect(again.id).toBe(bystander.id);
    expect(
      await db.notification.count({ where: { userId: bystander.id } }),
    ).toBe(1);
    expect(await db.account.count({ where: { userId: bystander.id } })).toBe(1);
  });
});

describe("credentials and links issued before deletion", () => {
  it("AD-STALE-01 an unredeemed OAuth exchange code for the deleted user cannot mint a session", async () => {
    const address = newEmail("exchange");
    const sub = subject();
    const original = await oauthLogin("google", sub, address);
    const pendingCode = await oauthCode("google", sub, address);

    await deleteMe(original.token).expect(200);

    const res = await request(server())
      .post("/auth/oauth/exchange")
      .send({ code: pendingCode })
      .expect(401);
    expect(res.body.code).toBe("INVALID_OAUTH_EXCHANGE_CODE");
    expect(await db.session.count({ where: { userId: original.id } })).toBe(0);
  });

  it("AD-STALE-02 a pending 2FA challenge token for the deleted user is rejected", async () => {
    const address = newEmail("twofa");
    const original = await register(address);
    await db.user.update({
      where: { id: original.id },
      data: { twoFactorEnabled: true, twoFactorSecret: "placeholder" },
    });
    const login = await passwordLogin(address).expect(200);
    expect(login.body.twoFactorRequired).toBe(true);
    await db.user.update({
      where: { id: original.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    await deleteMe(original.token, PASSWORD).expect(200);

    const res = await request(server())
      .post("/auth/2fa/challenge")
      .send({ challengeToken: login.body.challengeToken, code: "123456" })
      .expect(401);
    expect(res.body.code).toBe("INVALID_CHALLENGE_TOKEN");
  });

  it("AD-STALE-03 a Settings 'Connect' link intent minted before deletion cannot attach a provider to anything", async () => {
    const address = newEmail("link");
    const original = await register(address);
    const state = auth.createOAuthLinkIntent(original.id, "github");

    await deleteMe(original.token, PASSWORD).expect(200);

    const sub = subject();
    const res = await oauthCallback("github", sub, newEmail("attacker"), state);
    expect(res.headers.location).toBe(
      `${FRONTEND_URL}/settings?connectionError=github&reason=unknown`,
    );
    expect(await db.account.count({ where: { providerAccountId: sub } })).toBe(
      0,
    );
    expect(await db.user.findUnique({ where: { id: original.id } })).toBeNull();
  });

  it("AD-STALE-04 a password-reset link requested before deletion is purged with the account and cannot set a password on a later account", async () => {
    const address = newEmail("reset");
    const original = await register(address);
    sendPasswordResetEmail.mockClear();
    await request(server())
      .post("/auth/forgot-password")
      .send({ email: address })
      .expect(200);
    await new Promise((r) => setImmediate(r));
    const resetToken = sendPasswordResetEmail.mock.calls[0]?.[1] as string;
    expect(
      await db.verificationToken.count({ where: { identifier: address } }),
    ).toBe(1);

    await deleteMe(original.token, PASSWORD).expect(200);

    // PB20: no personal data (the email lives in this row) left behind.
    expect(
      await db.verificationToken.count({ where: { identifier: address } }),
    ).toBe(0);

    // A later, unrelated fresh signup with the same address (OAuth-only,
    // no password) must not be claimable through the pre-deletion link.
    const fresh = await oauthLogin("google", subject(), address);
    const res = await request(server())
      .post("/auth/reset-password")
      .send({ token: resetToken, password: "Hijacked-pass-1" })
      .expect(400);
    expect(res.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    const row = await db.user.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(row.passwordHash).toBeNull();
  });
});

describe("deletion request authorization and failure paths", () => {
  it("AD-AUTHZ-01 no token / garbage token cannot delete", async () => {
    await request(server())
      .delete("/users/me")
      .send({ confirmation: "DELETE" })
      .expect(401);
    await deleteMe("not-a-jwt").expect(401);
  });

  it("AD-AUTHZ-02 wrong password or missing DELETE confirmation leaves account, sessions and identities intact", async () => {
    const address = newEmail("wrongpw");
    const original = await register(address);
    const state = auth.createOAuthLinkIntent(original.id, "google");
    await oauthCallback("google", subject(), address, state);

    const wrong = await deleteMe(original.token, "Not-the-password-1").expect(
      400,
    );
    expect(wrong.body.code).toBe("CURRENT_PASSWORD_INCORRECT");
    await deleteMe(original.token).expect(400);
    await request(server())
      .delete("/users/me")
      .set(bearer(original.token))
      .send({ password: PASSWORD, confirmation: "delete" })
      .expect(400);

    expect(
      await db.user.findUnique({ where: { id: original.id } }),
    ).not.toBeNull();
    expect(await db.account.count({ where: { userId: original.id } })).toBe(1);
    await request(server())
      .get("/auth/me")
      .set(bearer(original.token))
      .expect(200);
  });

  it("AD-AUTHZ-03 a token can only ever delete its own account", async () => {
    const a = await register(newEmail("owner-a"));
    const b = await register(newEmail("owner-b"));
    await deleteMe(a.token, PASSWORD).expect(200);
    expect(await db.user.findUnique({ where: { id: b.id } })).not.toBeNull();
    await request(server()).get("/auth/me").set(bearer(b.token)).expect(200);
  });

  it("AD-ROLLBACK a blocked deletion (active job posting) changes nothing", async () => {
    const address = newEmail("employer");
    const res = await request(server())
      .post("/auth/register")
      .send({
        name: "Employer QA",
        email: address,
        password: PASSWORD,
        role: "EMPLOYER",
      })
      .expect(201);
    const userId = res.body.user.id as string;
    const employer = await db.employerProfile.create({
      data: { userId, companyName: "Deletion QA Co", slug: randomUUID() },
    });
    await db.job.create({
      data: {
        employerId: employer.id,
        title: "QA",
        description: "QA",
        slug: randomUUID(),
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await request(server())
      .post("/auth/forgot-password")
      .send({ email: address })
      .expect(200);

    const blocked = await deleteMe(res.body.accessToken, PASSWORD).expect(409);
    expect(blocked.body.code).toBe("ACTIVE_JOBS_PREVENT_DELETION");
    expect(await db.user.findUnique({ where: { id: userId } })).not.toBeNull();
    expect(await db.session.count({ where: { userId, revokedAt: null } })).toBe(
      1,
    );
    expect(
      await db.verificationToken.count({ where: { identifier: address } }),
    ).toBe(1);
  });
});

describe("concurrency", () => {
  it("AD-RACE-01 double-submitted delete: exactly one succeeds, no 5xx, account gone", async () => {
    const address = newEmail("double");
    const original = await register(address);
    const results = await Promise.all([
      deleteMe(original.token, PASSWORD),
      deleteMe(original.token, PASSWORD),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.every((s) => s < 500)).toBe(true);
    await expectGone(original.id);
  });

  it.each(["password", "google"] as const)(
    "AD-RACE-02 %s sign-in racing the delete never leaves a usable session on the deleted account",
    async (method) => {
      const address = newEmail(`race-${method}`);
      const sub = subject();
      const original =
        method === "password"
          ? await register(address)
          : await oauthLogin("google", sub, address);

      const signInDuring = async () => {
        if (method === "password") {
          const r = await passwordLogin(address);
          return r.status === 200 ? (r.body.accessToken as string) : null;
        }
        const code = await oauthCode("google", sub, address);
        const r = await request(server())
          .post("/auth/oauth/exchange")
          .send({ code });
        return r.status === 200 ? (r.body.accessToken as string) : null;
      };

      const [deletion, ...racers] = await Promise.all([
        deleteMe(original.token, method === "password" ? PASSWORD : undefined),
        ...Array.from({ length: 6 }, signInDuring),
      ]);
      expect(deletion.status).toBe(200);
      expect(await db.session.count({ where: { userId: original.id } })).toBe(
        0,
      );

      // A racer may have signed in *after* the delete committed — that is a
      // fresh account (OAuth) and must not be the deleted id. Any token that
      // still points at the deleted id must be dead.
      for (const token of racers.filter((t): t is string => !!t)) {
        const me = await request(server()).get("/auth/me").set(bearer(token));
        if (me.status === 200) expect(me.body.id).not.toBe(original.id);
        else expect(me.status).toBe(401);
      }
    },
  );
});
