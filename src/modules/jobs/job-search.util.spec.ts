import {
  activeJobBaseWhere,
  assembleFacets,
  buildCategoryFacetsQuery,
  buildFacetCountsQuery,
  buildJobOrderBy,
  buildJobWhere,
  buildSearchRankedIdsQuery,
  notExpiredCondition,
  type FacetCountsRow,
} from "./job-search.util";
import type { ListJobsDto } from "./dto/list-jobs.dto";

describe("buildSearchRankedIdsQuery", () => {
  it("parameterizes the search term instead of interpolating it into the SQL text", () => {
    const query = buildSearchRankedIdsQuery("'; DROP TABLE jobs; --", [
      "job-1",
    ]);

    expect(query.sql).not.toContain("DROP TABLE");
    // The term appears twice (the @@ match and the ts_rank_cd ORDER BY), plus
    // the candidate id — as bound parameters, not string-concatenated into
    // the query text.
    expect(query.values).toEqual([
      "job-1",
      "'; DROP TABLE jobs; --",
      "'; DROP TABLE jobs; --",
    ]);
  });

  it("scopes the match to the caller's candidate ids, not a table-wide scan", () => {
    const query = buildSearchRankedIdsQuery("remote engineer", [
      "job-1",
      "job-2",
    ]);

    // Filtering (status/published/expiry/other query params) is the caller's
    // job via buildJobWhere — this query only ranks within the id set it's
    // handed, so there's no separate status/date predicate to assert on here.
    expect(query.sql).toContain("WHERE id IN (");
    expect(query.values).toEqual(expect.arrayContaining(["job-1", "job-2"]));
    expect(query.sql).toContain(
      "\"searchVector\" @@ websearch_to_tsquery('english',",
    );
    expect(query.sql).toContain("ORDER BY ts_rank_cd(");
  });

  it("has no LIMIT — the candidate id list (from buildJobWhere) is already the true bound, so capping here would silently undercount `total` again", () => {
    const query = buildSearchRankedIdsQuery("remote engineer", ["job-1"]);

    expect(query.sql).not.toContain("LIMIT");
  });
});

describe("notExpiredCondition / activeJobBaseWhere", () => {
  it("passes a listing with no expiresAt (unpaid, HANDS_ON, or pre-existing)", () => {
    const where = notExpiredCondition();
    expect(where).toEqual({
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
  });

  it("folds the same not-expired condition into the ACTIVE base where", () => {
    const where = activeJobBaseWhere();
    expect(where).toMatchObject({
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
  });
});

const zeroCounts: FacetCountsRow = {
  jobtype_fulltime: 0,
  jobtype_contract: 0,
  jobtype_parttime: 0,
  seniority_entry: 0,
  seniority_mid: 0,
  seniority_senior: 0,
  tz_sea: 0,
  tz_async: 0,
  tz_sg: 0,
  tz_au: 0,
  tz_us: 0,
};

describe("assembleFacets", () => {
  it("zero-fills every tracked category even when no row matches it", () => {
    const facets = assembleFacets(zeroCounts, []);

    expect(facets.jobType).toEqual({
      "Full-time": 0,
      Contract: 0,
      "Part-time": 0,
    });
    expect(facets.seniority).toEqual({ Entry: 0, Mid: 0, Senior: 0 });
    expect(facets.timezone).toEqual({
      sea: 0,
      async: 0,
      SG: 0,
      AU: 0,
      US: 0,
    });
    expect(facets.category).toEqual({
      Engineering: 0,
      Design: 0,
      Data: 0,
      Product: 0,
      Marketing: 0,
    });
  });

  it("maps each raw aggregate column to its public facet label", () => {
    const facets = assembleFacets(
      {
        ...zeroCounts,
        jobtype_fulltime: 3,
        jobtype_contract: 2,
        jobtype_parttime: 1,
        seniority_entry: 1,
        seniority_mid: 4,
        seniority_senior: 3,
        tz_sea: 2,
        tz_async: 1,
        tz_sg: 1,
        tz_au: 0,
        tz_us: 1,
      },
      [],
    );

    expect(facets.jobType).toEqual({
      "Full-time": 3,
      Contract: 2,
      "Part-time": 1,
    });
    expect(facets.seniority).toEqual({ Entry: 1, Mid: 4, Senior: 3 });
    expect(facets.timezone).toEqual({ sea: 2, async: 1, SG: 1, AU: 0, US: 1 });
  });

  it("fills in category counts from the join-table query, ignoring untracked names", () => {
    const facets = assembleFacets(zeroCounts, [
      { name: "Engineering", count: 5 },
      { name: "Data", count: 2 },
      { name: "Not Tracked", count: 99 },
    ]);

    expect(facets.category).toEqual({
      Engineering: 5,
      Design: 0,
      Data: 2,
      Product: 0,
      Marketing: 0,
    });
  });
});

describe("buildFacetCountsQuery", () => {
  it("only counts ACTIVE, published jobs, with no user input to parameterize", () => {
    const query = buildFacetCountsQuery();

    expect(query.sql).toContain("status = 'ACTIVE'");
    expect(query.sql).toContain('"publishedAt" <= now()');
    expect(query.sql).toContain("FILTER");
  });

  it("excludes expired listings from every facet count", () => {
    const query = buildFacetCountsQuery();

    expect(query.sql).toContain('("expiresAt" IS NULL OR "expiresAt" > now())');
  });
});

describe("buildCategoryFacetsQuery", () => {
  it("joins job_categories/categories/jobs and groups by category name", () => {
    const query = buildCategoryFacetsQuery();

    expect(query.sql).toContain("GROUP BY c.name");
    expect(query.sql).toContain("j.status = 'ACTIVE'");
    // The 5 tracked category names are bound parameters, not inlined text.
    expect(query.values).toEqual([
      "Engineering",
      "Design",
      "Data",
      "Product",
      "Marketing",
    ]);
  });

  it("excludes expired listings, using the jobs-table alias", () => {
    const query = buildCategoryFacetsQuery();

    expect(query.sql).toContain(
      '(j."expiresAt" IS NULL OR j."expiresAt" > now())',
    );
  });
});

describe("buildJobOrderBy", () => {
  it("orders by salaryMax for sort=salary", () => {
    expect(buildJobOrderBy("salary")).toEqual([
      { salaryMax: "desc" },
      { publishedAt: "desc" },
    ]);
  });

  it("orders by publishedAt only for sort=recent, ignoring isFeatured", () => {
    expect(buildJobOrderBy("recent")).toEqual([{ publishedAt: "desc" }]);
  });

  it("puts featured jobs first for sort=featured and for no sort at all", () => {
    const expected = [{ isFeatured: "desc" }, { publishedAt: "desc" }];
    expect(buildJobOrderBy("featured")).toEqual(expected);
    expect(buildJobOrderBy(undefined)).toEqual(expected);
  });
});

describe("buildJobWhere", () => {
  const baseQuery: ListJobsDto = { page: 1, limit: 20 };

  it("filters by a single country the same as before it accepted arrays", () => {
    const where = buildJobWhere({ ...baseQuery, country: ["Vietnam"] });
    expect(where).toMatchObject({
      AND: [{ country: { in: ["Vietnam"] } }],
    });
  });

  it("filters by multiple countries", () => {
    const where = buildJobWhere({
      ...baseQuery,
      country: ["Vietnam", "Singapore"],
    });
    expect(where).toMatchObject({
      AND: [{ country: { in: ["Vietnam", "Singapore"] } }],
    });
  });

  it("omits the country condition entirely when none is given", () => {
    const where = buildJobWhere(baseQuery);
    expect(where).not.toHaveProperty("AND");
  });
});
