import { Prisma } from "@prisma/client";
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

// A listing with no expiresAt (unpaid, HANDS_ON, or approved before this
// field existed) never expires; everything else stops counting as "live"
// once its window is up. Exported so employer.repository.ts's company-
// profile job list applies the exact same rule instead of drifting.
export function notExpiredCondition(): Prisma.JobWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

export function activeJobBaseWhere(): Prisma.JobWhereInput {
  return {
    status: "ACTIVE",
    publishedAt: { not: null, lte: new Date() },
    ...notExpiredCondition(),
  };
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

// searchVector (20260723100000_add_job_search_vector) isn't declared in
// schema.prisma — Prisma's schema DSL can't express a generated tsvector
// column or its GIN index without extra preview features, and nothing needs
// the fluent client for it — so ranked search only ever runs as raw SQL, with
// the ordered id list threaded back into a normal Prisma `where: { id: { in
// } } }` for everything else (JobsService.list()). This caps how many
// candidates the ranking query considers rather than paginating in SQL —
// reasonable at this app's scale; revisit if that stops holding.
export const SEARCH_CANDIDATE_LIMIT = 2000;

// websearch_to_tsquery (not to_tsquery/plainto_tsquery) because it never
// throws on arbitrary user input — stray `&`, `|`, `:`, or unbalanced
// parentheses degrade gracefully instead of raising a syntax error the way
// to_tsquery would.
export function buildSearchRankedIdsQuery(q: string): Prisma.Sql {
  return Prisma.sql`
    SELECT id
    FROM "jobs"
    WHERE status = 'ACTIVE'
      AND "publishedAt" IS NOT NULL
      AND "publishedAt" <= now()
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
      AND "searchVector" @@ websearch_to_tsquery('english', ${q})
    ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('english', ${q})) DESC
    LIMIT ${SEARCH_CANDIDATE_LIMIT}
  `;
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

const zeroCounts = (keys: readonly string[]): Record<string, number> =>
  Object.fromEntries(keys.map((key) => [key, 0]));

export type FacetCountsRow = {
  jobtype_fulltime: number;
  jobtype_contract: number;
  jobtype_parttime: number;
  seniority_entry: number;
  seniority_mid: number;
  seniority_senior: number;
  tz_sea: number;
  tz_async: number;
  tz_sg: number;
  tz_au: number;
  tz_us: number;
};

export type CategoryFacetRow = { name: string; count: number };

/**
 * Facets used to be computed by pulling every active job's jobType/level/
 * country/timezone/categories into Node (findFacetRows(), no LIMIT) and
 * reducing them in one JS pass. That cost grows linearly with the active-job
 * count on every cache-miss (every 60s — see JobsService) regardless of how
 * few people are actually browsing: rows fetched over the wire, held in
 * memory, and walked in JS just to produce 17 integers. Postgres can produce
 * the same 17 integers itself via conditional aggregation, so the DB never
 * sends more than one row (plus up to 5 category rows) back to the app.
 *
 * jobType/seniority conditions mirror FILTER_OPTIONS' bucket definitions
 * exactly (each row belongs to exactly one bucket); timezone conditions
 * mirror tzCondition() exactly (a row can count toward more than one bucket,
 * same as before — each COUNT(*) FILTER is independent).
 */
export function buildFacetCountsQuery(): Prisma.Sql {
  const seaCountries = Prisma.join(SEA_COUNTRIES);
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE "jobType" = 'FULL_TIME')::int AS jobtype_fulltime,
      COUNT(*) FILTER (WHERE "jobType" IN ('CONTRACT', 'FREELANCE'))::int AS jobtype_contract,
      COUNT(*) FILTER (WHERE "jobType" = 'PART_TIME')::int AS jobtype_parttime,
      COUNT(*) FILTER (WHERE level = 'ENTRY')::int AS seniority_entry,
      COUNT(*) FILTER (WHERE level = 'MID')::int AS seniority_mid,
      COUNT(*) FILTER (WHERE level IN ('SENIOR', 'LEAD', 'EXECUTIVE'))::int AS seniority_senior,
      COUNT(*) FILTER (
        WHERE country IN (${seaCountries}) OR timezone LIKE '%+7%' OR timezone LIKE '%+8%'
      )::int AS tz_sea,
      COUNT(*) FILTER (WHERE timezone ILIKE '%async%')::int AS tz_async,
      COUNT(*) FILTER (WHERE country = ${TZ_COUNTRY.SG})::int AS tz_sg,
      COUNT(*) FILTER (WHERE country = ${TZ_COUNTRY.AU})::int AS tz_au,
      COUNT(*) FILTER (WHERE country = ${TZ_COUNTRY.US})::int AS tz_us
    FROM "jobs"
    WHERE status = 'ACTIVE'
      AND "publishedAt" IS NOT NULL AND "publishedAt" <= now()
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
  `;
}

// Categories aren't mutually exclusive and live in a join table, so they're a
// separate GROUP BY rather than another COUNT(*) FILTER column above.
export function buildCategoryFacetsQuery(): Prisma.Sql {
  const trackedNames = Prisma.join(FILTER_OPTIONS.category);
  return Prisma.sql`
    SELECT c.name, COUNT(*)::int AS count
    FROM job_categories jc
    JOIN categories c ON c.id = jc."categoryId"
    JOIN jobs j ON j.id = jc."jobId"
    WHERE j.status = 'ACTIVE'
      AND j."publishedAt" IS NOT NULL
      AND j."publishedAt" <= now()
      AND (j."expiresAt" IS NULL OR j."expiresAt" > now())
      AND c.name IN (${trackedNames})
    GROUP BY c.name
  `;
}

export const assembleFacets = (
  counts: FacetCountsRow,
  categoryRows: CategoryFacetRow[],
): Facets => {
  // buildCategoryFacetsQuery already filters to tracked names in SQL, but this
  // stays defensive about it — only counts that land on a key zeroCounts()
  // actually declared get written, so an untracked name can't sneak a stray
  // key into the response.
  const category = zeroCounts(FILTER_OPTIONS.category);
  for (const row of categoryRows) {
    if (row.name in category) category[row.name] = row.count;
  }

  return {
    jobType: {
      "Full-time": counts.jobtype_fulltime,
      Contract: counts.jobtype_contract,
      "Part-time": counts.jobtype_parttime,
    },
    seniority: {
      Entry: counts.seniority_entry,
      Mid: counts.seniority_mid,
      Senior: counts.seniority_senior,
    },
    timezone: {
      sea: counts.tz_sea,
      async: counts.tz_async,
      SG: counts.tz_sg,
      AU: counts.tz_au,
      US: counts.tz_us,
    },
    category,
  };
};
