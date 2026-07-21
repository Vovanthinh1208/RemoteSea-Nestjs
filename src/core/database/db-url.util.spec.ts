import { withPoolParams } from "./db-url.util";

const BASE_URL =
  "postgresql://user:pass@db.example.com:5432/postgres?sslmode=require";

describe("withPoolParams", () => {
  it("returns the URL byte-for-byte unchanged when neither knob is set", () => {
    expect(withPoolParams(BASE_URL)).toBe(BASE_URL);
  });

  it("appends connection_limit while preserving existing params", () => {
    const result = withPoolParams(BASE_URL, 10);
    expect(result).toContain("connection_limit=10");
    expect(result).toContain("sslmode=require");
    expect(result).not.toContain("pool_timeout");
  });

  it("appends pool_timeout on its own", () => {
    const result = withPoolParams(BASE_URL, undefined, 20);
    expect(result).toContain("pool_timeout=20");
    expect(result).not.toContain("connection_limit");
  });

  it("appends both knobs together", () => {
    const result = withPoolParams(BASE_URL, 5, 30);
    expect(result).toContain("connection_limit=5");
    expect(result).toContain("pool_timeout=30");
  });

  it("overrides a connection_limit already present in the URL", () => {
    const result = withPoolParams(`${BASE_URL}&connection_limit=99`, 10);
    expect(result).toContain("connection_limit=10");
    expect(result).not.toContain("connection_limit=99");
  });

  it("appends statement_timeout on its own", () => {
    const result = withPoolParams(BASE_URL, undefined, undefined, 5);
    expect(result).toContain("statement_timeout=5");
    expect(result).not.toContain("connection_limit");
    expect(result).not.toContain("pool_timeout=");
  });

  it("appends all three knobs together", () => {
    const result = withPoolParams(BASE_URL, 5, 30, 10);
    expect(result).toContain("connection_limit=5");
    expect(result).toContain("pool_timeout=30");
    expect(result).toContain("statement_timeout=10");
  });
});
