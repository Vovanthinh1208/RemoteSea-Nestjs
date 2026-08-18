import { domainMatches } from "./verification.util";

describe("domainMatches", () => {
  it("matches an exact domain", () => {
    expect(domainMatches("https://acme.com", "jane@acme.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(domainMatches("https://Acme.com", "jane@ACME.COM")).toBe(true);
  });

  it("ignores a leading www. on the website", () => {
    expect(domainMatches("https://www.acme.com", "jane@acme.com")).toBe(true);
  });

  it("ignores a leading www. on the email domain", () => {
    expect(domainMatches("https://acme.com", "jane@www.acme.com")).toBe(true);
  });

  it("rejects a mismatched domain", () => {
    expect(domainMatches("https://acme.com", "jane@other.com")).toBe(false);
  });

  it("rejects a subdomain as a mismatch", () => {
    expect(domainMatches("https://acme.com", "jane@mail.acme.com")).toBe(false);
  });

  it("returns false for a malformed website URL", () => {
    expect(domainMatches("not-a-url", "jane@acme.com")).toBe(false);
  });

  it("returns false for a malformed email", () => {
    expect(domainMatches("https://acme.com", "not-an-email")).toBe(false);
  });
});
