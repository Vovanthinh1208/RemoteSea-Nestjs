import { applyDecorators } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from "@nestjs/swagger";
import {
  ForbiddenApiResponse,
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";

const ApplicationNotFoundResponse = ApiNotFoundResponse({
  description: "No application with that id",
  schema: { example: { error: "Not found" } },
});

const ApplicationAccessDeniedResponse = ApiForbiddenResponse({
  description:
    "The caller isn't a company member with access to this application",
  schema: { example: { error: "Forbidden" } },
});

const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: {
    example: { error: "Validation failed", details: { body: ["Required"] } },
  },
});

export const ApiListComments = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List the internal discussion thread for an application",
      description:
        "Private to the company — never shown to the talent. Open to any team member with access to this application (APPLICATION_REVIEW_ROLES, or the specific INTERVIEWER assigned to it), same access as the scorecards endpoints. Oldest first — reads like the conversation actually happened.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiOkResponse({
      description: "Every comment posted on this application so far",
      schema: {
        example: {
          comments: [
            {
              id: "clx1",
              authorId: "clu1",
              author: { name: "Jane Doe" },
              body: "Strong on system design, a bit light on Postgres internals.",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    }),
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiCreateComment = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Post a comment to an application's internal discussion thread",
      description:
        "Append-only — there is no edit or delete endpoint, the same way ApplicationStatusEvent is a log rather than an editable record. Never shown to the talent.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiBody({ schema: { example: { body: "Let's move them to interview." } } }),
    ApiCreatedResponse({
      description: "Comment posted",
      schema: {
        example: {
          id: "clx1",
          authorId: "clu1",
          author: { name: "Jane Doe" },
          body: "Let's move them to interview.",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    }),
    ValidationErrorResponse,
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("30 req/60s per user"),
    InternalServerErrorApiResponse,
  );
