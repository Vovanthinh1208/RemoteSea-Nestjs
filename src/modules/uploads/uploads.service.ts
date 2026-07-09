import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import {
  CONTENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  S3_CLIENT,
  sanitize,
} from "./constants";
import type { PresignDto } from "./dto/presign.dto";
import type { PresignResult } from "./interfaces";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async createPresignedUpload(
    userId: string,
    dto: PresignDto,
  ): Promise<PresignResult> {
    const { type, filename, contentType, fileSize } = dto;

    if (!(CONTENT_TYPES[type] as readonly string[]).includes(contentType)) {
      throw new BadRequestApiException("Unsupported content type");
    }

    if (fileSize > MAX_FILE_SIZE_BYTES[type]) {
      throw new BadRequestApiException(
        `File too large — max ${Math.floor(MAX_FILE_SIZE_BYTES[type] / (1024 * 1024))}MB for ${type}`,
      );
    }

    // Date.now() alone is millisecond-resolution — two presigns for the same
    // filename in the same millisecond (a scripted double-submit, two tabs)
    // would silently overwrite each other. nanoid makes the key collision-safe.
    const key = `uploads/${type}/${userId}/${Date.now()}-${nanoid(8)}-${sanitize(filename)}`;

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.config.get("S3_BUCKET", { infer: true }),
        Key: key,
        ContentType: contentType,
        ContentLength: fileSize,
        // The key above is already unique per upload, so the object it points to
        // is immutable — let the CDN cache it for as long as possible instead of
        // falling back to the bucket/CDN's default (commonly short) TTL.
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { expiresIn: 300 },
    );

    const publicUrl = `${this.config.get("CDN_URL", { infer: true })}/${key}`;

    return { uploadUrl, publicUrl, key };
  }

  /**
   * Best-effort delete of a previously-uploaded object, e.g. when a profile
   * field that holds one of our own upload URLs is being overwritten. Without
   * this, every avatar/logo/resume re-upload leaves the previous object
   * permanently orphaned in the bucket — there's no lifecycle policy elsewhere
   * in the app that would ever clean it up. Silently no-ops for anything that
   * isn't actually one of our own CDN URLs (nothing to delete, not an error).
   */
  async deleteObjectByUrl(url: string): Promise<void> {
    const cdnUrl = this.config.get("CDN_URL", { infer: true });
    if (!cdnUrl || !url.startsWith(`${cdnUrl}/uploads/`)) return;
    const key = url.slice(`${cdnUrl}/`.length);

    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.config.get("S3_BUCKET", { infer: true }),
          Key: key,
        }),
      );
    } catch (error) {
      // Never let a cleanup failure block the profile update that triggered it.
      this.logger.warn(
        `Failed to delete orphaned upload ${key}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
