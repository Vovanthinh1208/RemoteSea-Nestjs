import { Logger } from "@nestjs/common";
import { UsersService } from "./users.service";
import { renderPersonalDataPdf } from "./personal-data-pdf-job";
import { ExportTooLargeError } from "./personal-data-contract";

jest.mock("./personal-data-pdf-job", () => ({
  renderPersonalDataPdf: jest.fn(),
}));
const account = {
  id: "u",
  email: "private-email@example.test",
  name: "Nguyễn Tên Riêng",
  role: "TALENT",
  createdAt: new Date(),
  exportSnapshotAt: new Date(),
};
const service = (findExportData: jest.Mock) =>
  new UsersService(
    { findExportData } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
describe("PB17 output, failure and resource guards", () => {
  afterEach(() => jest.restoreAllMocks());
  it("maps database failure to a safe 503 without PII in application audit logs", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const s = service(
      jest
        .fn()
        .mockRejectedValue(
          new Error("DB error: private-email@example.test PASSWORD_SECRET"),
        ),
    );
    await expect(s.exportData("u")).rejects.toMatchObject({ status: 503 });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /private-email|PASSWORD_SECRET|Nguyễn/,
    );
  });
  it("does not return a fake document when the renderer fails", async () => {
    jest
      .mocked(renderPersonalDataPdf)
      .mockRejectedValueOnce(new Error("Font failure"));
    await expect(
      service(jest.fn().mockResolvedValue(account)).exportDataAsPdf("u", "en"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("strips unknown nested fields while preserving legitimate text values", async () => {
    const data = {
      ...account,
      passwordHash: "PASSWORD_SECRET",
      api_key: "API_SECRET",
      talent: {
        bio: "passwordHash is a variable name, not a field here",
        workExperiences: [],
        applications: [
          {
            id: "a",
            status: "APPLIED",
            job: { title: "Engineer", employer: { companyName: "Example" } },
            notes: "INTERNAL_SECRET",
            credential: { access_token: "TOKEN_SECRET" },
          },
        ],
      },
    };
    const result = await service(jest.fn().mockResolvedValue(data)).exportData(
      "u",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /PASSWORD_SECRET|API_SECRET|INTERNAL_SECRET|TOKEN_SECRET/,
    );
    expect(result.account.talent?.bio).toBe(data.talent.bio);
    expect(result.account.talent?.applications?.[0]).not.toHaveProperty(
      "notes",
    );
    expect(result.metadata?.referenceId).toMatch(/^[\da-f-]{36}$/i);
  });
  it("rejects an unexpected owner returned by the collection boundary", async () => {
    await expect(
      service(
        jest.fn().mockResolvedValue({ ...account, id: "other" }),
      ).exportData("u"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rejects a concurrent export for the same user and releases the guard afterwards", async () => {
    let release!: (value: typeof account) => void;
    const find = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(account);
    const s = service(find),
      first = s.exportData("u");
    await expect(s.exportData("u")).rejects.toMatchObject({ status: 429 });
    release(account);
    await first;
    await expect(s.exportData("u")).resolves.toHaveProperty("account.id", "u");
  });
  it("returns a clear 413 rather than a silently incomplete archive", async () => {
    await expect(
      service(
        jest.fn().mockRejectedValue(new ExportTooLargeError()),
      ).exportData("u"),
    ).rejects.toMatchObject({ status: 413 });
  });
});
