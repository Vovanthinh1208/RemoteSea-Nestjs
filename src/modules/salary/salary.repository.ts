import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { SalaryBenchmark } from "./interfaces";

@Injectable()
export class SalaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  // One aggregate query instead of pulling every active, salaried job (fanned
  // out per category via the job_categories join) into app memory to average
  // in JS. `mid` rounds each row's midpoint first, then averages those —
  // matching the two-stage rounding the previous JS implementation did
  // (Math.round per row, then Math.round of the average), not a single
  // average-then-round pass, which is not the same number.
  findBenchmarks(): Promise<SalaryBenchmark[]> {
    return this.prisma.$queryRaw<SalaryBenchmark[]>(Prisma.sql`
      SELECT
        c.name AS role,
        ROUND(AVG(j."salaryMin"))::int AS min,
        ROUND(AVG(COALESCE(j."salaryMax", j."salaryMin")))::int AS max,
        ROUND(AVG(ROUND((j."salaryMin" + COALESCE(j."salaryMax", j."salaryMin")) / 2.0)))::int AS mid,
        COUNT(*)::int AS count
      FROM categories c
      JOIN job_categories jc ON jc."categoryId" = c.id
      JOIN jobs j ON j.id = jc."jobId"
      WHERE j.status = 'ACTIVE' AND j."salaryMin" IS NOT NULL
      GROUP BY c.name
      ORDER BY count DESC
    `);
  }
}
