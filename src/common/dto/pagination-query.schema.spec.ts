import { paginationQuerySchema } from "./pagination-query.schema";

describe("paginationQuerySchema", () => {
  it("fills in defaults when both params are omitted", () => {
    const result = paginationQuerySchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it("coerces string query params to numbers", () => {
    const result = paginationQuerySchema.parse({ page: "3", limit: "10" });
    expect(result).toEqual({ page: 3, limit: 10 });
  });

  it("rejects a page below 1", () => {
    expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("rejects a page above the cap", () => {
    expect(() => paginationQuerySchema.parse({ page: 100_001 })).toThrow();
  });

  it("accepts a page at the cap", () => {
    expect(paginationQuerySchema.parse({ page: 100_000 }).page).toBe(100_000);
  });

  it("rejects a limit above 50", () => {
    expect(() => paginationQuerySchema.parse({ limit: 51 })).toThrow();
  });
});
