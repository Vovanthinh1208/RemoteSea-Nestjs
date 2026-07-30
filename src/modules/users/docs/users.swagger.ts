import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  AccountFieldsResponseDto,
  ChangePasswordRequestDto,
  ConnectionResponseDto,
  DeleteAccountResponseDto,
  ExportDataResponseDto,
  MessageResponseDto,
  NotificationPreferencesResponseDto,
  PauseStateResponseDto,
  RevokeOtherSessionsResponseDto,
  SessionResponseDto,
  SuccessResponseDto,
  UpdateAccountRequestDto,
  UpdateNotificationPreferencesRequestDto,
  UpdateUserRequestDto,
  UpdateUserResponseDto,
} from "./users.dto";
import {
  AccountFieldsExample,
  ChangePasswordRequestExample,
  ChangePasswordResponseExample,
  ConnectionsListExample,
  DeleteAccountResponseExample,
  ExportDataExample,
  NotificationPreferencesExample,
  PauseStateExample,
  PausedStateExample,
  RevokeOtherSessionsExample,
  SessionsListExample,
  SuccessExample,
  UpdateAccountRequestExample,
  UpdateNotificationPreferencesRequestExample,
  UpdateUserRequestExample,
  UpdateUserResponseExample,
} from "./users.examples";
import {
  CannotRevokeCurrentSessionResponse,
  ConnectionNotFoundResponse,
  EmptyBodyValidationErrorResponse,
  IncorrectCurrentPasswordResponse,
  LastSignInMethodResponse,
  SessionNotFoundResponse,
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

// ─── Settings > Account ────────────────────────────────────────────────────

export const ApiGetAccount = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get account fields",
      description:
        "Reads the current Settings > Account field values (phone/language/region/currency/avatar).",
    }),
    ApiOkResponse({
      type: AccountFieldsResponseDto,
      schema: { example: AccountFieldsExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateAccount = () =>
  applyDecorators(
    ApiOperation({
      summary: "Update account fields",
      description:
        "Updates one or more of phone/language/region/currencyDisplay/image — the display preferences have no other reader yet (no i18n/locale switching or currency-formatting logic consumes them). `image` must be a URL from this account's own POST /uploads/presign (type: avatar) response, or null to remove the photo — any other URL is rejected. At least one field is required.",
    }),
    ApiBody({
      type: UpdateAccountRequestDto,
      examples: { default: { value: UpdateAccountRequestExample } },
    }),
    ApiOkResponse({
      description: "Account fields updated",
      type: AccountFieldsResponseDto,
      schema: { example: AccountFieldsExample },
    }),
    EmptyBodyValidationErrorResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

// ─── Settings > Notifications ──────────────────────────────────────────────

export const ApiGetNotificationPreferences = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get notification preferences",
      description:
        "Returns Settings > Notifications toggles, creating a default row on first read if none exists yet. Nothing in the app currently sends a notification gated by these.",
    }),
    ApiOkResponse({
      type: NotificationPreferencesResponseDto,
      schema: { example: NotificationPreferencesExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateNotificationPreferences = () =>
  applyDecorators(
    ApiOperation({
      summary: "Update notification preferences",
      description:
        "Updates one or more toggles (upserts the row if it doesn't exist yet).",
    }),
    ApiBody({
      type: UpdateNotificationPreferencesRequestDto,
      examples: {
        default: { value: UpdateNotificationPreferencesRequestExample },
      },
    }),
    ApiOkResponse({
      type: NotificationPreferencesResponseDto,
      schema: { example: NotificationPreferencesExample },
    }),
    EmptyBodyValidationErrorResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

// ─── Settings > Danger zone "Pause my account" ─────────────────────────────

export const ApiGetPauseState = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get pause state",
      description:
        'Reads the current pause state (so the UI shows "Pause" vs. "Reactivate" correctly on load).',
    }),
    ApiOkResponse({
      type: PauseStateResponseDto,
      schema: { example: PauseStateExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiPauseAccount = () =>
  applyDecorators(
    ApiOperation({
      summary: "Pause account",
      description:
        "Reversible, unlike DELETE /users/me. Does NOT block sign-in — the user must be able to log back in to reactivate. Not enforced anywhere else yet (a paused user's public profile, jobs, etc. behave exactly as before).",
    }),
    ApiOkResponse({
      description: "Account paused",
      type: PauseStateResponseDto,
      schema: { example: PausedStateExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiReactivateAccount = () =>
  applyDecorators(
    ApiOperation({
      summary: "Reactivate account",
      description: "Reverses POST /users/me/pause.",
    }),
    ApiOkResponse({
      description: "Account reactivated",
      type: PauseStateResponseDto,
      schema: { example: PauseStateExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

// ─── Settings > Privacy & data ──────────────────────────────────────────────

export const ApiExportData = () =>
  applyDecorators(
    ApiOperation({
      summary: "Export account data",
      description:
        'Settings > Privacy & data "Download your data". Assembles the account\'s own profile, applications/jobs, and job alerts as a single JSON payload. Excludes internal-only fields (passwordHash, stripeSessionId, reviewNote, etc.).',
    }),
    ApiOkResponse({
      type: ExportDataResponseDto,
      schema: { example: ExportDataExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

// ─── Settings > Connected accounts ─────────────────────────────────────────

export const ApiListConnections = () =>
  applyDecorators(
    ApiOperation({
      summary: "List connected accounts",
      description:
        "Settings > Connected accounts. Lists linked OAuth providers (Google, GitHub, LinkedIn — see GET /auth/:provider/link to connect a new one).",
    }),
    ApiOkResponse({
      type: [ConnectionResponseDto],
      schema: { example: ConnectionsListExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiDisconnectConnection = () =>
  applyDecorators(
    ApiOperation({
      summary: "Disconnect a connected account",
      description:
        "Unlinks an OAuth provider. Blocked if this would leave the account with no way to sign in (no password set and this is the only connected provider).",
    }),
    ApiParam({ name: "provider", enum: ["google", "github", "linkedin"] }),
    ApiOkResponse({
      type: SuccessResponseDto,
      schema: { example: SuccessExample },
    }),
    ConnectionNotFoundResponse,
    LastSignInMethodResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

// ─── Settings > Security > Active sessions ─────────────────────────────────

export const ApiListSessions = () =>
  applyDecorators(
    ApiOperation({
      summary: "List active sessions",
      description:
        "Every login creates a Session row whose id becomes the issued JWT's `sid` claim — JwtStrategy rejects any token whose session is missing or revoked, on every authenticated request. Lists the caller's own non-revoked sessions, newest-activity first. `device` is parsed from the request's User-Agent and `location` resolved from the stored IP (offline geoip-lite lookup) — both computed at read time, not stored pre-formatted.",
    }),
    ApiOkResponse({
      type: [SessionResponseDto],
      schema: { example: SessionsListExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiRevokeSession = () =>
  applyDecorators(
    ApiOperation({
      summary: "Revoke a session",
      description:
        "Revokes one other session immediately — its access token stops working on the very next request. Blocked for the caller's own current session; use sign-out for that instead.",
    }),
    ApiParam({ name: "id", description: "A Session id" }),
    ApiOkResponse({
      type: SuccessResponseDto,
      schema: { example: SuccessExample },
    }),
    CannotRevokeCurrentSessionResponse,
    SessionNotFoundResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiRevokeOtherSessions = () =>
  applyDecorators(
    ApiOperation({
      summary: "Sign out of all other sessions",
      description:
        "Revokes every one of the caller's sessions except the current one.",
    }),
    ApiOkResponse({
      type: RevokeOtherSessionsResponseDto,
      schema: { example: RevokeOtherSessionsExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );
