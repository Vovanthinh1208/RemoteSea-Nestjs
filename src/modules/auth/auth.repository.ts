import { Injectable } from "@nestjs/common";
import type { User, UserRole } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

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
}
