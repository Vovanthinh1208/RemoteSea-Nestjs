import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

@Injectable()
export class TaxonomyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, icon: true },
    });
  }

  findSkills(where?: Prisma.SkillWhereInput) {
    return this.prisma.skill.findMany({
      where,
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, name: true, slug: true },
    });
  }
}
