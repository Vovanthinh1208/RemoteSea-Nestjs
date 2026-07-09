import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Uploads module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class PresignRequestDto {
  @ApiProperty({ enum: ["avatar", "logo", "resume"], example: "resume" })
  type!: "avatar" | "logo" | "resume";

  @ApiProperty({
    minLength: 1,
    maxLength: 200,
    example: "resume.pdf",
    description: "Sanitized before use in the S3 key",
  })
  filename!: string;

  @ApiProperty({
    example: "application/pdf",
    description:
      "Must belong to the whitelist for the given `type`: avatar/logo → image/jpeg, image/png, image/webp; resume → application/pdf",
  })
  contentType!: string;

  @ApiProperty({
    example: 245_760,
    description:
      "Exact byte size of the file. Signed into the presigned URL as ContentLength — S3 rejects the PUT if the uploaded bytes don't match exactly. Max: avatar/logo 5MB, resume 10MB.",
  })
  fileSize!: number;
}

export class PresignResponseDto {
  @ApiProperty({
    example:
      "https://s3.amazonaws.com/bucket-name/uploads/resume/.../1751443200000-resume.pdf?X-Amz-Signature=...",
    description: "Presigned S3 PUT URL, expires in 300s",
  })
  uploadUrl!: string;

  @ApiProperty({
    example:
      "https://cdn.remotesea.io/uploads/resume/.../1751443200000-resume.pdf",
  })
  publicUrl!: string;

  @ApiProperty({ example: "uploads/resume/.../1751443200000-resume.pdf" })
  key!: string;
}
