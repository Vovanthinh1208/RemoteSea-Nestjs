import { httpUrlSchema } from "./http-url.schema";

describe("httpUrlSchema", () => {
  it("accepts http and https URLs", () => {
    expect(httpUrlSchema.safeParse("https://janedoe.dev").success).toBe(true);
    expect(httpUrlSchema.safeParse("http://example.com/x").success).toBe(true);
  });

  it("rejects javascript: and data: payloads that z.string().url() would accept", () => {
    expect(
      httpUrlSchema.safeParse("javascript:alert(document.cookie)").success,
    ).toBe(false);
    expect(
      httpUrlSchema.safeParse("data:text/html,<script>alert(1)</script>")
        .success,
    ).toBe(false);
  });

  it("rejects other schemes and non-URLs", () => {
    expect(httpUrlSchema.safeParse("ftp://files.example.com").success).toBe(
      false,
    );
    expect(httpUrlSchema.safeParse("not a url").success).toBe(false);
  });
});
