import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  updateName(
    id: string,
    name: string,
  ): Promise<Pick<User, "id" | "name" | "email">> {
    return this.prisma.user.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, email: true },
    });
  }

  deleteUser(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }

  // Read before deleteUser so the caller can best-effort clean up the S3
  // object these reference — TalentProfile/EmployerProfile cascade-delete
  // with the User row (see the schema's onDelete: Cascade), so once that
  // completes there's no longer any DB record of the resume/logo's key to
  // find it by. Without this read, the file would sit orphaned in the
  // bucket forever (same "nothing else ever cleans this up" gap that
  // uploads.service.ts's deleteObjectByUrl already closes for profile
  // *updates* — this closes it for account deletion instead).
  async findProfileFileUrls(
    userId: string,
  ): Promise<{ resumeUrl: string | null; logoUrl: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        talent: { select: { resumeUrl: true } },
        employer: { select: { logoUrl: true } },
      },
    });
    return {
      resumeUrl: user?.talent?.resumeUrl ?? null,
      logoUrl: user?.employer?.logoUrl ?? null,
    };
  }

  // Backs UsersService.deleteAccount's upfront check — jobs.employerId's FK
  // is ON DELETE RESTRICT specifically so a User delete can't cascade through
  // EmployerProfile and silently wipe other users' Application/SavedJob rows
  // (see the migration that changed it). This lets deleteAccount give a
  // clear error before attempting the delete, rather than surfacing the raw
  // FK-violation the database would otherwise reject it with.
  countEmployerJobs(userId: string): Promise<number> {
    return this.prisma.job.count({ where: { employer: { userId } } });
  }

  findPasswordHash(id: string): Promise<Pick<User, "passwordHash"> | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
