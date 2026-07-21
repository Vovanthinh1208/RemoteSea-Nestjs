import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("leaves plain text unchanged", () => {
    expect(escapeHtml("Senior Backend Engineer")).toBe(
      "Senior Backend Engineer",
    );
  });

  it("escapes an HTML injection attempt", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("escapes each of the 5 reserved characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
