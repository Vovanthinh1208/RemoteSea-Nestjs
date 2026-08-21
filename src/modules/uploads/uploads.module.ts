import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { S3_CLIENT } from "./constants";
import type { EnvConfig } from "@/core/config/env.validation";

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: S3_CLIENT,
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        new S3Client({
          region: config.get("S3_REGION", { infer: true }) ?? "auto",
          endpoint: config.get("S3_ENDPOINT", { infer: true }),
          // AWS SDK v3 defaults to WHEN_SUPPORTED, which attaches a flexible
          // CRC32 checksum to presigned PutObject URLs. At presign time this
          // process has never seen the actual file (it's uploaded straight
          // from the browser, see UploadsService's doc comment), so the SDK
          // has nothing real to checksum — the value it embeds is a
          // placeholder for an empty body. Cloudflare R2 validates that
          // checksum against the real uploaded bytes and rejects the
          // mismatch with a 403, breaking every presigned upload. WHEN_REQUIRED
          // matches AWS's own documented workaround for S3-compatible
          // providers (R2, MinIO, ...) — PutObject only requires a checksum
          // when the caller explicitly asks for one, which nothing here does.
          requestChecksumCalculation: "WHEN_REQUIRED",
          credentials: {
            accessKeyId: config.get("S3_ACCESS_KEY_ID", {
              infer: true,
            }) as string,
            secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", {
              infer: true,
            }) as string,
          },
          // Unset by default — the SDK falls back to the OS's own TCP timeout,
          // which can leave a hung request open for minutes. The only live call
          // this client ever makes is UploadsService.deleteObjectByUrl's
          // best-effort cleanup (presigning is local, no network call), always
          // fire-and-forget — without a bound, a stalled S3-compatible endpoint
          // could pile up indefinitely-open sockets across every profile/resume
          // replace and account deletion instead of failing (and logging) fast.
          requestHandler: new NodeHttpHandler({
            connectionTimeout: 5_000,
            requestTimeout: 10_000,
          }),
        }),
      inject: [ConfigService],
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
