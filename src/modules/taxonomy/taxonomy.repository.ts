import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import { notExpiredCondition } from "@/modules/jobs/job-search.util";

export type CategoryWithJobCount = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  jobCount: number;
};

@Injectable()
export class TaxonomyRepository {
  constructor(private readonly prisma: PrismaService) {}

  // PB51 AC2: every category plus how many live jobs it currently holds —
  // "live" is the same ACTIVE + not-expired rule the public /jobs board uses,
  // so the counts match what a visitor actually finds after filtering.
  async findAllCategories(): Promise<CategoryWithJobCount[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        _count: {
          select: {
            jobs: {
              where: { job: { status: "ACTIVE", ...notExpiredCondition() } },
            },
          },
        },
      },
    });
    return rows.map(({ _count, ...category }) => ({
      ...category,
      jobCount: _count.jobs,
    }));
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
