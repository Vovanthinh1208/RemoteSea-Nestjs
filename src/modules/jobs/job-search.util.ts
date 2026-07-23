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

export const SEA_COUNTRIES = [
  "Singapore",
  "Vietnam",
  "Indonesia",
  "Philippines",
  "Malaysia",
  "Thailand",
];

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
  if (query.country?.length) {
    and.push({ country: { in: query.country } });
  }
  if (query.category?.length) {
    and.push({
      categories: { some: { category: { slug: { in: query.category } } } },
    });
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

export function buildJobOrderBy(
  sort?: string,
): Prisma.JobOrderByWithRelationInput[] {
  if (sort === "salary")
    return [{ salaryMax: "desc" }, { publishedAt: "desc" }];
  // "recent" used to silently fall through to the same isFeatured-first order
  // as "featured"/the default — the two were indistinguishable despite being
  // separate, documented values of the same enum (list-jobs.dto.ts).
  if (sort === "recent") return [{ publishedAt: "desc" }];
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

const matchesTz = (row: FacetRow, key: string): boolean => {
  if (key === "sea") {
    return (
      (row.country !== null && SEA_COUNTRIES.includes(row.country)) ||
      (row.timezone?.includes("+7") ?? false) ||
      (row.timezone?.includes("+8") ?? false)
    );
  }

  if (key === "async") {
    return row.timezone?.toLowerCase().includes("async") ?? false;
  }

  return row.country === TZ_COUNTRY[key];
};

// jobType/seniority buckets are mutually exclusive (every JobType/
// ExperienceLevel enum value maps to exactly one FILTER_OPTIONS label), so a
// reverse lookup turns "which bucket does this row belong to" into one Map
// read instead of testing every label against every row.
const buildReverseLookup = <TValue extends string>(
  labelToValues: Record<string, TValue[]>,
): Map<TValue, string> => {
  const lookup = new Map<TValue, string>();
  for (const [label, values] of Object.entries(labelToValues)) {
    for (const value of values) lookup.set(value, label);
  }
  return lookup;
};

const JOBTYPE_LABEL_BY_ENUM = buildReverseLookup(JOBTYPE_TO_ENUMS);
const SENIORITY_LABEL_BY_LEVEL = buildReverseLookup(SENIORITY_TO_LEVELS);
const TRACKED_CATEGORY_NAMES = new Set(FILTER_OPTIONS.category);

const zeroCounts = (keys: readonly string[]): Record<string, number> =>
  Object.fromEntries(keys.map((key) => [key, 0]));

/**
 * Single pass over `rows` instead of 17 separate `.filter().length` calls (4
 * jobType + 3 seniority + 5 timezone + 5 category) — each of those walked the
 * full active-jobs set on its own, so building the same facets object used to
 * cost O(17 × rows.length) plus 17 throwaway intermediate arrays. Timezone and
 * category buckets aren't mutually exclusive (a row can match more than one
 * timezone key, or belong to more than one tracked category), so those still
 * check each row individually — just within this one pass, not their own.
 */
export const computeFacets = (rows: FacetRow[]): Facets => {
  const facets: Facets = {
    jobType: zeroCounts(FILTER_OPTIONS.jobType),
    timezone: zeroCounts(FILTER_OPTIONS.timezone),
    seniority: zeroCounts(FILTER_OPTIONS.seniority),
    category: zeroCounts(FILTER_OPTIONS.category),
  };

  // Every index below is guaranteed present: zeroCounts() pre-populated
  // facets.jobType/seniority/timezone/category from these exact same
  // FILTER_OPTIONS arrays (JOBTYPE_LABEL_BY_ENUM/SENIORITY_LABEL_BY_LEVEL are
  // built from the same source, and the category branch is gated on
  // TRACKED_CATEGORY_NAMES, itself built from FILTER_OPTIONS.category).
  for (const row of rows) {
    const jobTypeLabel = JOBTYPE_LABEL_BY_ENUM.get(row.jobType);
    if (jobTypeLabel !== undefined) facets.jobType[jobTypeLabel]! += 1;

    const seniorityLabel = SENIORITY_LABEL_BY_LEVEL.get(row.level);
    if (seniorityLabel !== undefined) facets.seniority[seniorityLabel]! += 1;

    for (const key of FILTER_OPTIONS.timezone) {
      if (matchesTz(row, key)) facets.timezone[key]! += 1;
    }

    for (const { category } of row.categories) {
      if (TRACKED_CATEGORY_NAMES.has(category.name)) {
        facets.category[category.name]! += 1;
      }
    }
  }

  return facets;
};
