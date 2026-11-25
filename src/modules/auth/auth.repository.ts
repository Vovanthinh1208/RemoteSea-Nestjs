import { Injectable } from "@nestjs/common";
import type { Account, Session, User, UserRole } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  isEncryptedTwoFactorSecret,
} from "./two-factor-secret.crypto";

export type SessionMeta = { userAgent?: string; ip?: string };
export type AuthSessionProfile = Pick<
  User,
  "id" | "email" | "role" | "image"
> & {
  name: string;
};

@Injectable()
export class AuthRepository {
  // Short-lived in-memory cache and promise coalescing for session state lookups.
  // When multiple parallel requests (e.g. 8 concurrent requests on /settings)
  // arrive with the same session id, promise coalescing ensures only ONE DB query
  // is fired, and subsequent lookups within the TTL are served immediately from memory.
  private readonly sessionCache = new Map<
    string,
    {
      expiresAt: number;
      data: {
        id: string;
        userId: string;
        revokedAt: Date | null;
        lastSeenAt: Date;
        user: {
          bannedAt: Date | null;
          role: UserRole;
          email: string;
          name: string | null;
        };
      } | null;
    }
  >();
  private readonly inflightSessionLookups = new Map<
    string,
    Promise<{
      id: string;
      userId: string;
      revokedAt: Date | null;
      lastSeenAt: Date;
      user: {
        bannedAt: Date | null;
        role: UserRole;
        email: string;
        name: string | null;
      };
    } | null>
  >();

  // Throttles touchSession so concurrent requests don't execute multiple updates on the same row.
  private readonly touchedSessionMap = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Narrow existence check for callers that only need to know whether the
  // email is taken (register's dup-check, forgotPassword) — avoids pulling
  // every User column, including passwordHash, on these high-traffic paths.
  findUserIdByEmail(
    email: string,
  ): Promise<Pick<User, "id" | "bannedAt"> | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, bannedAt: true },
    });
  }

  findSessionProfile(userId: string): Promise<AuthSessionProfile | null> {
    return this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, image: true },
      })
      .then((user) => user && { ...user, name: user.name ?? "" });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } }).then(async (user) => {
      if (!user?.twoFactorSecret) return user;
      const secret = await this.readAndMigrateTwoFactorSecret(
        id,
        user.twoFactorSecret,
      );
      return { ...user, twoFactorSecret: secret };
    });
  }

  async findTwoFactorState(
    userId: string,
  ): Promise<Pick<
    User,
    "twoFactorEnabled" | "twoFactorSecret" | "twoFactorBackupCodes"
  > | null> {
    const state = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });
    if (!state?.twoFactorSecret) return state;
    return {
      ...state,
      twoFactorSecret: await this.readAndMigrateTwoFactorSecret(
        userId,
        state.twoFactorSecret,
      ),
    };
  }

  private async readAndMigrateTwoFactorSecret(
    userId: string,
    stored: string,
  ): Promise<string> {
    if (isEncryptedTwoFactorSecret(stored)) {
      return decryptTwoFactorSecret(stored);
    }

    // Existing installations may have plaintext values from before PB10
    // encryption was added. Re-encrypt with a compare-and-swap so a concurrent
    // setup cannot have its newer secret overwritten by this compatibility read.
    const encrypted = encryptTwoFactorSecret(stored);
    await this.prisma.user.updateMany({
      where: { id: userId, twoFactorSecret: stored },
      data: { twoFactorSecret: encrypted },
    });
    return stored;
  }

  // Written on /auth/2fa/setup, before twoFactorEnabled is ever set — a
  // second setup call before verifying just overwrites the pending secret.
  async setTwoFactorSecret(userId: string, secret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptTwoFactorSecret(secret) },
    });
  }

  async enableTwoFactor(
    userId: string,
    hashedBackupCodes: string[],
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorBackupCodes: hashedBackupCodes },
    });
  }

  async disableTwoFactor(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });
  }

  // Atomically removes the matched backup code hash from the user's array
  // only if it is still present, returning true on success or false if already consumed.
  // This prevents race conditions and guarantees single-use even under concurrent requests.
  async consumeBackupCode(
    userId: string,
    matchedHash: string,
  ): Promise<boolean> {
    const count = await this.prisma.$executeRaw`
      UPDATE "users"
      SET "twoFactorBackupCodes" = array_remove("twoFactorBackupCodes", ${matchedHash})
      WHERE "id" = ${userId} AND ${matchedHash} = ANY("twoFactorBackupCodes")
    `;
    return count > 0;
  }

  createUser(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    talentSlug?: string;
  }): Promise<Pick<User, "id" | "email" | "name" | "role">> {
    const { talentSlug, ...rest } = data;
    return this.prisma.user.create({
      data: {
        ...rest,
        ...(talentSlug && { talent: { create: { slug: talentSlug } } }),
      },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async createVerificationToken(
    identifier: string,
    token: string,
    expires: Date,
  ) {
    const [, created] = await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({ where: { identifier } }),
      this.prisma.verificationToken.create({
        data: { identifier, token, expires },
      }),
    ]);
    return created;
  }

  findVerificationToken(token: string) {
    return this.prisma.verificationToken.findUnique({ where: { token } });
  }

  // Interactive transaction (not the array form), and deleteMany + a count
  // check instead of delete — this is what makes the token single-use under
  // a race: two concurrent resetPassword calls with the same token (double-
  // click, a retried request) both pass AuthService.resetPassword's
  // findVerificationToken/expiry check before either commits here. A plain
  // `delete` would let the loser hit P2025 (Prisma throws on deleting an
  // already-gone row) and surface as an inconsistent 404, and — worse — a
  // naive `deleteMany` with no count check would let the loser's user.update
  // still apply, silently allowing the same token to be consumed twice.
  // Checking count first and returning false without ever calling
  // user.update means the loser's transaction has no effect at all.
  async consumePasswordReset(
    identifier: string,
    token: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.verificationToken.deleteMany({
        where: { token },
      });
      if (count === 0) return false;

      await tx.user.update({
        where: { email: identifier },
        data: { passwordHash },
      });
      return true;
    });
  }

  async findOrCreateOAuthUser(params: {
    provider: string;
    providerAccountId: string;
    email: string;
    name: string | null;
    image: string | null;
  }): Promise<User> {
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: params.provider,
          providerAccountId: params.providerAccountId,
        },
      },
      include: { user: true },
    });
    if (existingAccount) return existingAccount.user;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: params.email },
        create: {
          email: params.email,
          name: params.name,
          image: params.image,
          emailVerified: true,
        },
        // All OAuthProfile instances are constructed only after the provider
        // strategy confirms the email address. Persist that proof when OAuth
        // signs up a new user or joins an existing account by verified email.
        update: { emailVerified: true },
      });

      // Upsert, not create: the existingAccount check above is a fast-path read
      // outside this transaction, so two concurrent callbacks for the same
      // provider+providerAccountId (double-click, provider redirect retry) can
      // both reach here with existingAccount still null. A plain create would
      // let the second one hit @@unique([provider, providerAccountId]) and
      // fail its whole login with a 409 instead of signing in.
      await tx.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: params.provider,
            providerAccountId: params.providerAccountId,
          },
        },
        create: {
          userId: user.id,
          type: "oauth",
          provider: params.provider,
          providerAccountId: params.providerAccountId,
        },
        update: {},
      });

      return user;
    });
  }

  // Backs AuthService.linkOAuthAccount's ownership check — does this
  // provider+providerAccountId already belong to someone (possibly this same
  // user, possibly someone else)?
  findAccountByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
  }

  // Settings > Connected accounts "Connect" — links a provider to an
  // already-authenticated user, as opposed to findOrCreateOAuthUser above
  // (which creates/finds a user by email during sign-in). Never touches the
  // User row itself.
  async createOAuthConnection(
    userId: string,
    profile: { provider: string; providerAccountId: string },
  ): Promise<void> {
    await this.prisma.account.create({
      data: {
        userId,
        type: "oauth",
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    });
  }

  // Created on every login/register/OAuth callback/2FA challenge completion —
  // this row's id becomes the JWT's `sid` claim (see AuthService.issueToken).
  createSession(userId: string, meta: SessionMeta): Promise<Session> {
    return this.prisma.session.create({
      data: { userId, userAgent: meta.userAgent, ip: meta.ip },
    });
  }

  // Read by JwtStrategy.validate on every authenticated request — narrow
  // select since that's a hot path. Uses Promise coalescing and a short-lived
  // in-memory cache to absorb concurrency spikes (e.g. settings page loading 8
  // queries at once) without hammering the database connection pool.
  async findSessionState(id: string) {
    const now = Date.now();
    const cached = this.sessionCache.get(id);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    const inflight = this.inflightSessionLookups.get(id);
    if (inflight) {
      return inflight;
    }

    const lookupPromise = (async () => {
      try {
        const session = await this.prisma.session.findUnique({
          where: { id },
          select: {
            id: true,
            userId: true,
            revokedAt: true,
            lastSeenAt: true,
            user: {
              select: { bannedAt: true, role: true, email: true, name: true },
            },
          },
        });
        const ttl = session ? 10_000 : 1_000;
        this.sessionCache.set(id, {
          expiresAt: Date.now() + ttl,
          data: session,
        });
        return session;
      } finally {
        this.inflightSessionLookups.delete(id);
      }
    })();

    this.inflightSessionLookups.set(id, lookupPromise);
    return lookupPromise;
  }

  async touchSession(id: string): Promise<void> {
    const now = Date.now();
    const lastTouched = this.touchedSessionMap.get(id) ?? 0;
    // Debounce touchSession to at most once per 60 seconds per session
    if (now - lastTouched < 60_000) {
      return;
    }
    this.touchedSessionMap.set(id, now);
    try {
      await this.prisma.session.update({
        where: { id },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      // Best-effort recency signal; ignore transient touch errors
    }
  }

  listActiveSessions(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  // Scoped to userId, not just the session's own id — without that, a caller
  // could revoke another user's session by guessing/enumerating ids.
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    this.sessionCache.delete(sessionId);
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<number> {
    this.sessionCache.clear();
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, NOT: { id: currentSessionId } },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  // Unlike revokeOtherSessions, excludes nothing — called when the user
  // themselves is no longer trusted (banned, or role changed by an admin),
  // not when they're clearing their own other devices.
  async revokeAllSessions(userId: string): Promise<number> {
    this.sessionCache.clear();
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}
