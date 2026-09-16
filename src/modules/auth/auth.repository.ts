import { Injectable } from "@nestjs/common";
import type { Account, Session, User, UserRole } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

export type SessionMeta = { userAgent?: string; ip?: string };

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Narrow existence check for callers that only need to know whether the
  // email is taken (register's dup-check, forgotPassword) — avoids pulling
  // every User column, including passwordHash, on these high-traffic paths.
  findUserIdByEmail(email: string): Promise<Pick<User, "id"> | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findTwoFactorState(
    userId: string,
  ): Promise<Pick<
    User,
    "twoFactorEnabled" | "twoFactorSecret" | "twoFactorBackupCodes"
  > | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });
  }

  // Written on /auth/2fa/setup, before twoFactorEnabled is ever set — a
  // second setup call before verifying just overwrites the pending secret.
  async setTwoFactorSecret(userId: string, secret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
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

  // Rewrites the whole array with the matched code removed — same
  // single-use guarantee as VerificationToken (see consumePasswordReset),
  // just array-shaped instead of a separate table since there are only ever
  // a handful of these per user.
  async consumeBackupCode(
    userId: string,
    remainingHashedCodes: string[],
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: remainingHashedCodes },
    });
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
        create: { email: params.email, name: params.name, image: params.image },
        update: {},
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
  // select since that's a hot path.
  findSessionState(
    id: string,
  ): Promise<Pick<
    Session,
    "id" | "userId" | "revokedAt" | "lastSeenAt"
  > | null> {
    return this.prisma.session.findUnique({
      where: { id },
      select: { id: true, userId: true, revokedAt: true, lastSeenAt: true },
    });
  }

  async touchSession(id: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
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
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}
