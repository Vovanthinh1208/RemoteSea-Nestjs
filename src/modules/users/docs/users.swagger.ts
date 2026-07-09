import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  ChangePasswordRequestDto,
  DeleteAccountResponseDto,
  MessageResponseDto,
  UpdateUserRequestDto,
  UpdateUserResponseDto,
} from "./users.dto";
import {
  ChangePasswordRequestExample,
  ChangePasswordResponseExample,
  DeleteAccountResponseExample,
  UpdateUserRequestExample,
  UpdateUserResponseExample,
} from "./users.examples";
import {
  IncorrectCurrentPasswordResponse,
  SocialSignInNoPasswordResponse,
  ValidationErrorResponse,
} from "./users.responses";

export const ApiUsersTag = () =>
  applyDecorators(ApiTags("Users"), ApiBearerAuth("bearer"));

export const ApiUpdateUserName = () =>
  applyDecorators(
    ApiOperation({
      summary: "Update display name",
      description: "Updates the authenticated user's display name.",
    }),
    ApiBody({
      type: UpdateUserRequestDto,
      examples: { default: { value: UpdateUserRequestExample } },
    }),
    ApiOkResponse({
      description: "Name updated",
      type: UpdateUserResponseDto,
      schema: { example: UpdateUserResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiDeleteAccount = () =>
  applyDecorators(
    ApiOperation({
      summary: "Delete account",
      description:
        "Permanently deletes the authenticated user's account (cascades to related records).",
    }),
    ApiOkResponse({
      description: "Account deleted",
      type: DeleteAccountResponseDto,
      schema: { example: DeleteAccountResponseExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiChangePassword = () =>
  applyDecorators(
    ApiOperation({
      summary: "Change password",
      description:
        "Changes the authenticated user's password after verifying the current one.",
    }),
    ApiBody({
      type: ChangePasswordRequestDto,
      examples: { default: { value: ChangePasswordRequestExample } },
    }),
    ApiOkResponse({
      description: "Password updated",
      type: MessageResponseDto,
      schema: { example: ChangePasswordResponseExample },
    }),
    ValidationErrorResponse,
    SocialSignInNoPasswordResponse,
    IncorrectCurrentPasswordResponse,
    UnauthorizedApiResponse,
    rateLimitResponse("5 req/60s per user"),
    InternalServerErrorApiResponse,
  );
