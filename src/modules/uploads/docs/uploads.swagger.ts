import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
import { PresignRequestDto, PresignResponseDto } from "./uploads.dto";
import { PresignRequestExample, PresignResponseExample } from "./uploads.examples";
import { FileTooLargeResponse, UnsupportedContentTypeResponse, ValidationErrorResponse } from "./uploads.responses";

/**
 * UploadsController has a controller-level @UseGuards(JwtAuthGuard), so the
 * bearer requirement is documented once, at class level, rather than on
 * every individual route decorator.
 */
export const ApiUploadsTag = () => applyDecorators(ApiTags("Uploads"), ApiBearerAuth("bearer"));

export const ApiPresign = () =>
  applyDecorators(
    ApiOperation({
      summary: "Generate a presigned upload URL",
      description:
        "Generates a presigned S3 PUT URL (expires in 300s) plus the resulting public CDN URL, for direct client-side upload. " +
        "`contentType` must belong to the whitelist for the given `type`: avatar/logo → image/jpeg, image/png, image/webp; resume → application/pdf. " +
        "S3 key: uploads/{type}/{userId}/{Date.now()}-{sanitizedFilename}.",
    }),
    ApiBody({ type: PresignRequestDto, examples: { default: { value: PresignRequestExample } } }),
    ApiCreatedResponse({ description: "Presigned upload URL generated", type: PresignResponseDto, schema: { example: PresignResponseExample } }),
    ValidationErrorResponse,
    UnsupportedContentTypeResponse,
    FileTooLargeResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse
  );
