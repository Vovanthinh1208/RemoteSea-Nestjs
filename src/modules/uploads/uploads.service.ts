import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CONTENT_TYPES, MAX_FILE_SIZE_BYTES, S3_CLIENT, sanitize } from "./constants";
import type { PresignDto } from "./dto/presign.dto";
import type { PresignResult } from "./interfaces";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";

@Injectable()
export class UploadsService {
  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService<EnvConfig, true>
  ) {}

  async createPresignedUpload(userId: string, dto: PresignDto): Promise<PresignResult> {
    const { type, filename, contentType, fileSize } = dto;

    if (!(CONTENT_TYPES[type] as readonly string[]).includes(contentType)) {
      throw new BadRequestApiException("Unsupported content type");
    }

    if (fileSize > MAX_FILE_SIZE_BYTES[type]) {
      throw new BadRequestApiException(
        `File too large — max ${Math.floor(MAX_FILE_SIZE_BYTES[type] / (1024 * 1024))}MB for ${type}`
      );
    }

    const key = `uploads/${type}/${userId}/${Date.now()}-${sanitize(filename)}`;

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.config.get("S3_BUCKET", { infer: true }),
        Key: key,
        ContentType: contentType,
        ContentLength: fileSize,
      }),
      { expiresIn: 300 }
    );

    const publicUrl = `${this.config.get("CDN_URL", { infer: true })}/${key}`;

    return { uploadUrl, publicUrl, key };
  }
}
