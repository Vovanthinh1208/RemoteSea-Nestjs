import { S3Client } from "@aws-sdk/client-s3";
import { UploadsService } from "./uploads.service";
import { ErrorCode } from "@/common/exceptions/error-codes";

// Presigning is local request signing (no network call), so a real S3Client
// with placeholder credentials is enough to exercise the validation path.
const makeService = () => {
  const s3 = new S3Client({
    region: "auto",
    endpoint: "https://s3.example.invalid",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  const config = {
    get: jest.fn(
      (key: string) =>
        ({ S3_BUCKET: "bucket", CDN_URL: "https://cdn.example.com" })[key],
    ),
  };
  return new UploadsService(s3, config as never);
};

const presign = (contentType: string, fileSize = 1024, type = "logo") =>
  makeService().createPresignedUpload("user-1", {
    type: type as "logo",
    filename: "logo.png",
    contentType,
    fileSize,
  });

describe("UploadsService.createPresignedUpload — company logo (PB30 AC3)", () => {
  it.each(["image/png", "image/jpeg"])("accepts %s", async (contentType) => {
    const result = await presign(contentType);
    expect(result.publicUrl).toMatch(
      /^https:\/\/cdn\.example\.com\/uploads\/logo\/user-1\//,
    );
  });

  it.each(["image/webp", "image/gif", "image/svg+xml"])(
    "refuses %s",
    async (contentType) => {
      await expect(presign(contentType)).rejects.toMatchObject({
        response: { code: ErrorCode.UNSUPPORTED_CONTENT_TYPE },
      });
    },
  );

  it("accepts exactly 5 MB and refuses anything larger", async () => {
    await expect(presign("image/png", 5 * 1024 * 1024)).resolves.toBeDefined();
    await expect(
      presign("image/png", 5 * 1024 * 1024 + 1),
    ).rejects.toMatchObject({ response: { code: ErrorCode.FILE_TOO_LARGE } });
  });

  it("still accepts WebP for the cover image (PB31 has no format rule)", async () => {
    await expect(presign("image/webp", 1024, "cover")).resolves.toBeDefined();
  });
});
