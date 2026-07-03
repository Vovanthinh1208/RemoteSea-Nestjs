import type { Prisma, JobType, ExperienceLevel } from "@prisma/client";
import type { ListJobsDto } from "./dto/list-jobs.dto";

/**
 * Ported from remotesea/src/lib/job-filters.ts + remotesea/src/lib/job-search.ts —
 * the richer filter/sort/facet vocabulary that originally lived only inside the
 * Next.js Server Component at remotesea/src/app/jobs/page.tsx (never a REST
 * endpoint in the original app). Reproduced here as additive, optional query
 * capabilities on GET /jobs so remotesea-api has no remaining functional gap
 * versus that original page's business rules.
 */

export const SALARY_FLOOR = 500;
export const SALARY_CEIL = 8000;

export const TZ_COUNTRY: Record<string, string> = {
  SG: "Singapore",
  AU: "Australia",
  US: "United States",
};

export const SEA_COUNTRIES = ["Singapore", "Vietnam", "Indonesia", "Philippines", "Malaysia", "Thailand"];

export const FILTER_OPTIONS = {
  jobType: ["Full-time", "Contract", "Part-time"],
  timezone: ["sea", "async", "SG", "AU", "US"],
  seniority: ["Entry", "Mid", "Senior"],
  category: ["Engineering", "Design", "Data", "Product", "Marketing"],
};

export const JOBTYPE_TO_ENUMS: Record<string, JobType[]> = {
  "Full-time": ["FULL_TIME"],
  Contract: ["CONTRACT", "FREELANCE"],
  "Part-time": ["PART_TIME"],
};

export const SENIORITY_TO_LEVELS: Record<string, ExperienceLevel[]> = {
  Entry: ["ENTRY"],
  Mid: ["MID"],
  Senior: ["SENIOR", "LEAD", "EXECUTIVE"],
};

export function activeJobBaseWhere(): Prisma.JobWhereInput {
  return { status: "ACTIVE", publishedAt: { not: null, lte: new Date() } };
}

function tzCondition(key: string): Prisma.JobWhereInput {
  if (key === "sea") {
    return {
      OR: [
        { country: { in: SEA_COUNTRIES } },
        { timezone: { contains: "+7" } },
        { timezone: { contains: "+8" } },
      ],
    };
  }
  if (key === "async") {
    return { timezone: { contains: "async", mode: "insensitive" } };
  }
  return { country: TZ_COUNTRY[key] };
}

export function buildJobWhere(query: ListJobsDto): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];

  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  if (query.type?.length) {
    and.push({ jobType: { in: query.type } });
  }
  if (query.level?.length) {
    and.push({ level: { in: query.level } });
  }
  if (query.country) {
    and.push({ country: query.country });
  }
  if (query.category?.length) {
    and.push({ categories: { some: { category: { slug: { in: query.category } } } } });
  }
  if (query.timezone?.length) {
    and.push({ OR: query.timezone.map(tzCondition) });
  }
  if (query.salaryMin !== undefined || query.salaryMax !== undefined) {
    const min = query.salaryMin ?? SALARY_FLOOR;
    const max = query.salaryMax ?? SALARY_CEIL;
    and.push({ salaryMax: { gte: min }, salaryMin: { lte: max } });
  }

  return { ...activeJobBaseWhere(), ...(and.length ? { AND: and } : {}) };
}

export function buildJobOrderBy(sort?: string): Prisma.JobOrderByWithRelationInput[] {
  if (sort === "salary") return [{ salaryMax: "desc" }, { publishedAt: "desc" }];
  return [{ isFeatured: "desc" }, { publishedAt: "desc" }];
}

export type Facets = {
  jobType: Record<string, number>;
  timezone: Record<string, number>;
  seniority: Record<string, number>;
  category: Record<string, number>;
};

export type FacetRow = {
  jobType: JobType;
  level: ExperienceLevel;
  country: string | null;
  timezone: string | null;
  categories: Array<{ category: { name: string } }>;
};

export const facetSelect = {
  jobType: true,
  level: true,
  country: true,
  timezone: true,
  categories: { select: { category: { select: { name: true } } } },
} satisfies Prisma.JobSelect;

function matchesTz(row: FacetRow, key: string): boolean {
  if (key === "sea") {
    return (
      (row.country !== null && SEA_COUNTRIES.includes(row.country)) ||
      (row.timezone?.includes("+7") ?? false) ||
      (row.timezone?.includes("+8") ?? false)
    );
  }
  if (key === "async") return row.timezone?.toLowerCase().includes("async") ?? false;
  return row.country === TZ_COUNTRY[key];
}

export function computeFacets(rows: FacetRow[]): Facets {
  const facets: Facets = { jobType: {}, timezone: {}, seniority: {}, category: {} };

  for (const label of FILTER_OPTIONS.jobType) {
    const enums = JOBTYPE_TO_ENUMS[label] ?? [];
    facets.jobType[label] = rows.filter((r) => enums.includes(r.jobType)).length;
  }
  for (const label of FILTER_OPTIONS.seniority) {
    const levels = SENIORITY_TO_LEVELS[label] ?? [];
    facets.seniority[label] = rows.filter((r) => levels.includes(r.level)).length;
  }
  for (const key of FILTER_OPTIONS.timezone) {
    facets.timezone[key] = rows.filter((r) => matchesTz(r, key)).length;
  }
  for (const name of FILTER_OPTIONS.category) {
    facets.category[name] = rows.filter((r) => r.categories.some((c) => c.category.name === name)).length;
  }

  return facets;
}
