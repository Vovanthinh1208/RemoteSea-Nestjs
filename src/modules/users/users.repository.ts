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
