import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type {
  SalaryBenchmark,
  SalaryBenchmarkByCountry,
  SalaryBenchmarkBySeniority,
} from "./interfaces";

@Injectable()
export class SalaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMatchingJobs(
    role: string,
    level?: import("@prisma/client").ExperienceLevel,
  ) {
    return this.prisma.job.findMany({
      where: {
        status: "ACTIVE",
        currency: "USD",
        salaryMin: { not: null },
        employer: { suspendedAt: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        categories: { some: { category: { name: role } } },
        ...(level && { level }),
      },
      take: 20,
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        salaryMin: true,
        salaryMax: true,
        employer: { select: { companyName: true } },
      },
    });
  }

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
        MIN(j."salaryMin")::int AS min,
        MAX(COALESCE(j."salaryMax", j."salaryMin"))::int AS max,
        ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (j."salaryMin" + COALESCE(j."salaryMax", j."salaryMin")) / 2.0))::numeric)::int AS mid,
        COUNT(*)::int AS count
      FROM categories c
      JOIN job_categories jc ON jc."categoryId" = c.id
      JOIN jobs j ON j.id = jc."jobId"
      JOIN employer_profiles e ON e.id = j."employerId"
      WHERE j.status = 'ACTIVE' AND j."salaryMin" IS NOT NULL AND j.currency = 'USD'
        AND e."suspendedAt" IS NULL AND (j."expiresAt" IS NULL OR j."expiresAt" > NOW())
        AND j."publishedAt" <= NOW() AND EXISTS (SELECT 1 FROM users u WHERE u.id = e."userId" AND NOT u."isPaused" AND u."bannedAt" IS NULL)
      GROUP BY c.name
      ORDER BY count DESC
    `);
  }

  // Same shape as findBenchmarks, split further by Job.level — backs the
  // Salary Insights explorer's role+seniority breakdown.
  findBenchmarksBySeniority(): Promise<SalaryBenchmarkBySeniority[]> {
    return this.prisma.$queryRaw<SalaryBenchmarkBySeniority[]>(Prisma.sql`
      SELECT
        c.name AS role,
        j.level::text AS level,
        MIN(j."salaryMin")::int AS min,
        MAX(COALESCE(j."salaryMax", j."salaryMin"))::int AS max,
        ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (j."salaryMin" + COALESCE(j."salaryMax", j."salaryMin")) / 2.0))::numeric)::int AS mid,
        COUNT(*)::int AS count
      FROM categories c
      JOIN job_categories jc ON jc."categoryId" = c.id
      JOIN jobs j ON j.id = jc."jobId"
      JOIN employer_profiles e ON e.id = j."employerId"
      WHERE j.status = 'ACTIVE' AND j."salaryMin" IS NOT NULL AND j.currency = 'USD'
        AND e."suspendedAt" IS NULL AND (j."expiresAt" IS NULL OR j."expiresAt" > NOW())
        AND j."publishedAt" <= NOW() AND EXISTS (SELECT 1 FROM users u WHERE u.id = e."userId" AND NOT u."isPaused" AND u."bannedAt" IS NULL)
      GROUP BY c.name, j.level
      ORDER BY count DESC
    `);
  }

  // Grouped by the *employer's* HQ country, not Job.country (which is a
  // candidate-location restriction, e.g. "Vietnam only") — Salary Insights'
  // country section is about where the paying company is based.
  findBenchmarksByCountry(): Promise<SalaryBenchmarkByCountry[]> {
    return this.prisma.$queryRaw<SalaryBenchmarkByCountry[]>(Prisma.sql`
      SELECT
        e."hqCountry" AS country,
        MIN(j."salaryMin")::int AS min,
        MAX(COALESCE(j."salaryMax", j."salaryMin"))::int AS max,
        ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (j."salaryMin" + COALESCE(j."salaryMax", j."salaryMin")) / 2.0))::numeric)::int AS mid,
        COUNT(*)::int AS count
      FROM jobs j
      JOIN employer_profiles e ON e.id = j."employerId"
      WHERE j.status = 'ACTIVE' AND j."salaryMin" IS NOT NULL AND j.currency = 'USD'
        AND e."suspendedAt" IS NULL AND (j."expiresAt" IS NULL OR j."expiresAt" > NOW())
        AND j."publishedAt" <= NOW() AND EXISTS (SELECT 1 FROM users u WHERE u.id = e."userId" AND NOT u."isPaused" AND u."bannedAt" IS NULL) AND e."hqCountry" IS NOT NULL
      GROUP BY e."hqCountry"
      ORDER BY count DESC
    `);
  }
}
