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
