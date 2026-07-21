import { computeFacets, type FacetRow } from "./job-search.util";

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
