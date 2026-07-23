import {
  buildJobOrderBy,
  buildJobWhere,
  buildSearchRankedIdsQuery,
  computeFacets,
  SEARCH_CANDIDATE_LIMIT,
  type FacetRow,
} from "./job-search.util";
import type { ListJobsDto } from "./dto/list-jobs.dto";

describe("buildSearchRankedIdsQuery", () => {
  it("parameterizes the search term instead of interpolating it into the SQL text", () => {
    const query = buildSearchRankedIdsQuery("'; DROP TABLE jobs; --");

    expect(query.sql).not.toContain("DROP TABLE");
    // The term appears twice (the @@ match and the ts_rank_cd ORDER BY), plus
    // SEARCH_CANDIDATE_LIMIT for the LIMIT clause — as bound parameters, not
    // string-concatenated into the query text.
    expect(query.values).toEqual([
      "'; DROP TABLE jobs; --",
      "'; DROP TABLE jobs; --",
      SEARCH_CANDIDATE_LIMIT,
    ]);
  });

  it("only matches ACTIVE, published jobs via websearch_to_tsquery on searchVector", () => {
    const query = buildSearchRankedIdsQuery("remote engineer");

    expect(query.sql).toContain("status = 'ACTIVE'");
    expect(query.sql).toContain('"publishedAt" <= now()');
    expect(query.sql).toContain(
      "\"searchVector\" @@ websearch_to_tsquery('english',",
    );
    expect(query.sql).toContain("ORDER BY ts_rank_cd(");
  });
});

const row = (overrides: Partial<FacetRow>): FacetRow => ({
  jobType: "FULL_TIME",
  level: "MID",
  country: null,
  timezone: null,
  categories: [],
  ...overrides,
});

describe("computeFacets", () => {
  it("zero-fills every declared option even when no row matches it", () => {
    const facets = computeFacets([]);
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

  it("buckets jobType and seniority as mutually exclusive counts", () => {
    const facets = computeFacets([
      row({ jobType: "FULL_TIME", level: "ENTRY" }),
      row({ jobType: "CONTRACT", level: "LEAD" }),
      row({ jobType: "FREELANCE", level: "EXECUTIVE" }),
      row({ jobType: "PART_TIME", level: "SENIOR" }),
    ]);

    expect(facets.jobType).toEqual({
      "Full-time": 1,
      Contract: 2, // CONTRACT and FREELANCE both roll up to "Contract"
      "Part-time": 1,
    });
    expect(facets.seniority).toEqual({ Entry: 1, Mid: 0, Senior: 3 });
  });

  it("counts a row toward every timezone bucket it matches, not just one", () => {
    // Vietnam + "async" in its timezone label matches both "sea" and "async".
    const facets = computeFacets([
      row({ country: "Vietnam", timezone: "Async / UTC+7" }),
      row({ country: "Singapore" }),
      row({ country: "United States" }),
    ]);

    expect(facets.timezone).toEqual({ sea: 2, async: 1, SG: 1, AU: 0, US: 1 });
  });

  it("counts a row toward every tracked category it belongs to, ignoring untracked ones", () => {
    const facets = computeFacets([
      row({
        categories: [
          { category: { name: "Engineering" } },
          { category: { name: "Data" } },
          { category: { name: "Not Tracked" } },
        ],
      }),
      row({ categories: [{ category: { name: "Engineering" } }] }),
    ]);

    expect(facets.category).toEqual({
      Engineering: 2,
      Design: 0,
      Data: 1,
      Product: 0,
      Marketing: 0,
    });
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
