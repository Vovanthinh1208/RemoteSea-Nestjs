import { isOwnedUploadUrl } from "./upload-url.util";

describe("owned upload URL authorization (PB53/PB66)", () => {
  const cdn = "https://cdn.example.test/bucket";
  const own = `${cdn}/uploads/resume/candidate-a/`;
  it("accepts a normal file owned by the submitting candidate", () => {
    expect(
      isOwnedUploadUrl(`${own}123-cv.pdf`, cdn, "candidate-a", "resume"),
    ).toBe(true);
  });
  it.each([
    "../candidate-b/cv.pdf",
    "%2e%2e/candidate-b/cv.pdf",
    "..\\candidate-b\\cv.pdf",
    "cv.pdf?redirect=/private",
    "cv.pdf#fragment",
    "",
  ])("rejects path or URL suffix %s", (suffix) => {
    expect(
      isOwnedUploadUrl(`${own}${suffix}`, cdn, "candidate-a", "resume"),
    ).toBe(false);
  });
  it("rejects another account's file and a foreign origin", () => {
    expect(
      isOwnedUploadUrl(
        `${cdn}/uploads/resume/candidate-b/cv.pdf`,
        cdn,
        "candidate-a",
        "resume",
      ),
    ).toBe(false);
    expect(
      isOwnedUploadUrl(
        "https://evil.example/uploads/resume/candidate-a/cv.pdf",
        cdn,
        "candidate-a",
        "resume",
      ),
    ).toBe(false);
  });
});
