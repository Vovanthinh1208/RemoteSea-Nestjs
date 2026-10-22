# RemoteSEA API Reference

Full endpoint reference for the RemoteSEA backend (NestJS). 75 routes across 15 modules — see [README.md](../README.md) for architecture and setup.

Base URL (local): `http://localhost:4000` (configurable via `PORT` / `APP_URL`).

## Conventions

**Authentication.** Protected routes require `Authorization: Bearer <jwt>`, issued by `POST /auth/login` or an OAuth callback. `JwtAuthGuard` rejects missing/invalid/expired tokens with `401 { "error": "Unauthorized" }`. Some routes additionally require a role via `RolesGuard` + `@Roles(...)`, or check ownership manually in the service layer (documented per-route below).

**Error shape.** Every thrown error is rendered by the global `GlobalExceptionFilter` as:

```json
{ "error": "<string>" }
```

or, for validation failures, `error` is a Zod `.flatten()` object:

```json
{ "error": { "formErrors": [], "fieldErrors": { "email": ["Invalid email"] } } }
```

A few routes bypass this convention — noted explicitly where it happens (e.g. `GET /health`, raw OAuth guard failures, `RolesGuard`'s `403`).

**Validation.** Request bodies/queries are validated with Zod schemas via a shared `ZodValidationPipe` (not `class-validator`), so invalid input always returns `400` with the flattened-error shape above.

**Rate limiting.** An in-memory, single-instance, fixed-window limiter (`RateLimitService`). Exceeding a limit returns `429 { "error": "Too many requests. Please slow down and try again shortly." }` with a `Retry-After` header (seconds). Limits are keyed per-IP or per-user depending on the route (noted per-endpoint).

**Pagination.** List endpoints that paginate accept `page` (default `1`) and `limit` (default `20`, max `50`, both coerced from query strings) and return:

```json
{
  "...": "...",
  "pagination": { "page": 1, "limit": 20, "total": 37, "pages": 2 }
}
```

## Modules

- [Health](#health)
- [Auth](#auth)
- [Users](#users)
- [Talent](#talent)
- [Work Experience](#work-experience)
- [Profile Highlights](#profile-highlights)
- [Employer](#employer)
- [Jobs](#jobs)
- [Taxonomy](#taxonomy)
- [Applications](#applications)
- [Saved Jobs](#saved-jobs)
- [Billing](#billing)
- [Uploads](#uploads)
- [Alerts](#alerts)
- [Admin](#admin)

---

## Health

Base path: `/health`. Writes its response directly via `@Res()`, so it's the one endpoint that fully bypasses `GlobalExceptionFilter` and the `{ "error": ... }` convention.

### GET /health

Liveness check: pings the database with `SELECT 1` and reports connectivity.

- **Auth**: None
- **Rate limit**: None
- **Request**: no params/query/body

**Success response — `200 OK`**

```json
{ "status": "ok", "timestamp": "2026-07-02T10:00:00.000Z", "db": "connected" }
```

**Error response**

| Status | Body                                          | Trigger                                                                        |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| 503    | `{ "status": "error", "db": "disconnected" }` | `SELECT 1` fails (DB unreachable) — note this is **not** the `{ error }` shape |

---

## Auth

Base path: `/auth`. Controller: `auth.controller.ts`.

> **OAuth-conditional routes**: `GET /auth/google(/callback)`, `GET /auth/github(/callback)`, and `GET /auth/linkedin(/callback)` are only registered when their respective credentials are configured (`AUTH_GOOGLE_ID`/`SECRET`, `AUTH_GITHUB_ID`/`SECRET`, `AUTH_LINKEDIN_ID`/`SECRET`). If unset, the strategy is never registered and hitting the route throws at the Passport layer (`500`) rather than a clean `404`. `GET /auth/:provider/link` is always registered (it just builds a URL from config, no Passport strategy involved) — the resulting URL simply won't work if that provider's credentials are unset.

### POST /auth/register

Creates a new user account (`TALENT` or `EMPLOYER`) with a bcrypt-hashed password; auto-provisions a `TalentProfile` (with a generated slug) for `TALENT` signups; schedules a welcome email when SMTP is configured; signs the new account in immediately (no separate `POST /auth/login` call needed).

- **Auth**: None
- **Rate limit**: 5 req / 60s, keyed per IP — `register:<ip>`
- **Body** (`registerSchema`):

| Field      | Type   | Required | Constraints            |
| ---------- | ------ | -------- | ---------------------- |
| `name`     | string | yes      | min 1, max 120         |
| `email`    | string | yes      | valid email            |
| `password` | string | yes      | min 8                  |
| `role`     | enum   | yes      | `TALENT` \| `EMPLOYER` |

```json
{
  "name": "Jane Doe",
  "email": "jane.doe@example.com",
  "password": "SuperSecret123",
  "role": "TALENT"
}
```

**Success response — `201 Created`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "role": "TALENT"
  }
}
```

**Errors**

| Status | Body                                      | Trigger                        |
| ------ | ----------------------------------------- | ------------------------------ |
| 400    | flattened Zod error                       | validation failure             |
| 409    | `{ "error": "Email already registered" }` | email already in use           |
| 429    | rate-limit body                           | too many requests from this IP |

---

### POST /auth/login

Validates email/password credentials. Issues a signed JWT directly — unless the account has two-factor authentication enabled, in which case it issues a short-lived challenge token instead (see `POST /auth/2fa/challenge` below). Every real access token is backed by a new `Session` row (device/IP captured from the request) — see `GET /users/me/sessions`.

- **Auth**: None
- **Rate limit**: 10 req/60s per IP (`login-ip:<ip>`) **and** 10 req/60s per email (`login-email:<email>`) — either can trip first
- **Body** (`loginSchema`): `email` (string, valid email, required), `password` (string, min 8, required)

```json
{ "email": "jane.doe@example.com", "password": "SuperSecret123" }
```

**Success response — `200 OK`** — one of two shapes:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "role": "TALENT"
  }
}
```

```json
{
  "twoFactorRequired": true,
  "challengeToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors**

| Status | Body                                       | Trigger                                                           |
| ------ | ------------------------------------------ | ----------------------------------------------------------------- |
| 400    | flattened Zod error                        | validation failure                                                |
| 401    | `{ "error": "Invalid email or password" }` | no such user, OAuth-only account (no password), or wrong password |
| 429    | rate-limit body                            | too many requests                                                 |

---

### POST /auth/2fa/challenge

Exchanges a `challengeToken` from `POST /auth/login` plus a 6-digit authenticator code (or an unused backup code) for a real access token. This is the only route that ever accepts a challenge token — `JwtStrategy` explicitly rejects one everywhere else.

- **Auth**: None (the challenge token itself is the credential)
- **Rate limit**: 10 req / 5min per IP (`2fa-challenge:<ip>`) **and** 10 req / 5min per target account, decoded from `challengeToken` (`2fa-challenge-account:<userId>`) — either can trip first, so a brute force spread across many source IPs still gets throttled per victim account
- **Body** (`twoFactorChallengeSchema`): `challengeToken` (string, required), `code` (string, 6–32 chars — a TOTP code or a backup code, required)

**Success response — `200 OK`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "role": "TALENT"
  }
}
```

**Errors**

| Status | Body                                                          | Trigger                                                         |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------- |
| 400    | flattened Zod error                                           | validation failure                                              |
| 400    | `{ "error": "Invalid code" }`                                 | code doesn't match the current TOTP window or any backup code   |
| 401    | `{ "error": "This code has expired — please sign in again" }` | challenge token missing/expired/invalid, or not a 2FA challenge |
| 429    | rate-limit body                                               | too many requests                                               |

---

### GET /auth/2fa/status

Whether the authenticated account currently has 2FA enabled.

- **Auth**: Bearer JWT required

**Success response — `200 OK`**

```json
{ "enabled": false }
```

---

### POST /auth/2fa/setup

Generates a new TOTP secret and stores it (unconfirmed — `twoFactorEnabled` stays `false` until `POST /auth/2fa/verify` succeeds). Calling this again before verifying just overwrites the pending secret.

- **Auth**: Bearer JWT required

**Success response — `200 OK`**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "otpauthUrl": "otpauth://totp/RemoteSEA:jane.doe%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=RemoteSEA",
  "qrCodeDataUrl": "data:image/png;base64,..."
}
```

---

### POST /auth/2fa/verify

Confirms the code from the authenticator app matches the secret from `POST /auth/2fa/setup`, then enables 2FA and generates 8 single-use backup codes.

- **Auth**: Bearer JWT required
- **Body** (`verifyTwoFactorSetupSchema`): `token` (string, exactly 6 digits, required)

**Success response — `200 OK`** — the only time these codes are ever returned in plaintext (only bcrypt hashes are persisted):

```json
{ "backupCodes": ["A1B2C-D3E4F", "..."] }
```

**Errors**: `400 { "error": "Start two-factor setup first" }` (no pending secret); `400 { "error": "Invalid code" }`.

---

### POST /auth/2fa/disable

Disables 2FA after verifying the account password, clearing the secret and all backup codes.

- **Auth**: Bearer JWT required
- **Body** (`disableTwoFactorSchema`): `password` (string, required)

**Success response — `200 OK`**

```json
{ "message": "Two-factor authentication disabled" }
```

**Errors**: `400 { "error": "Password change is not available for social sign-in accounts." }` (OAuth-only account); `401 { "error": "Incorrect password" }`.

---

### GET /auth/session

Reads an optional `Authorization: Bearer <jwt>` header, verifies it, and returns the decoded user — never throws.

- **Auth**: None required (manual verification, no guard) · **Rate limit**: None

**Success response — `200 OK` (always)**

```json
{
  "user": {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "role": "TALENT"
  }
}
```

or `{ "user": null }` if the header is missing/invalid/expired.

---

### GET /auth/google · GET /auth/google/callback

Redirects to Google's consent screen, then on callback looks up/creates the user, mints a short-lived (60s) exchange code, and redirects to `<FRONTEND_URL>/auth/callback?code=<exchangeCode>` — the frontend's callback page immediately calls `POST /auth/oauth/exchange` (below) to trade it for a real access token. The code is never a usable bearer token on its own, and isn't the long-lived access token itself, so it's safe to sit in browser history/Referer headers the way a raw token wouldn't be. Only registered if Google OAuth env vars are set.

- **Auth**: `GoogleAuthGuard` (`AuthGuard("google")`) · **Rate limit**: None
- **Success response**: `302 Found` redirect (no JSON body)
- **Errors**: `401 { "error": "Unauthorized", "code": "AUTHENTICATION_REQUIRED" }` for both a denied Passport auth and a Google profile with no verified email — `GoogleAuthGuard` overrides `handleRequest` (same as `JwtAuthGuard`) so every failure path returns the app's usual `{ error, code }` shape instead of falling through to Nest's default body or an unwrapped 500.

---

### GET /auth/github · GET /auth/github/callback

Same flow as Google, via `GithubAuthGuard`. Only registered if `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are set. Same error handling (including the missing-verified-email case).

---

### GET /auth/linkedin · GET /auth/linkedin/callback

Same shape as Google/GitHub above, via `LinkedinAuthGuard`. Uses "Sign In with LinkedIn using OpenID Connect" (`scope: openid profile email`, profile fetched from `https://api.linkedin.com/v2/userinfo`) rather than LinkedIn's older v1/v2 REST profile API. Only registered if `AUTH_LINKEDIN_ID`/`AUTH_LINKEDIN_SECRET` are set.

---

### POST /auth/oauth/exchange

The only route that ever accepts the short-lived `?code=` minted by a Google/GitHub/LinkedIn callback redirect above — trades it for a real access token. Called by the frontend's `/auth/callback` page immediately on landing, not something a user or client calls directly.

- **Auth**: None (the code itself is the credential)
- **Rate limit**: 20 req / 60s per IP — `oauth-exchange:<ip>`
- **Body**: `code` (string, required)

```json
{ "code": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Success response — `200 OK`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "role": "TALENT"
  }
}
```

**Errors**

| Status | Body                                                              | Trigger                                                                         |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 400    | flattened Zod error                                               | validation failure                                                              |
| 401    | `{ "error": "This sign-in link has expired — please try again" }` | code missing/expired/invalid, not an exchange code, or account no longer exists |
| 429    | rate-limit body                                                   | too many requests                                                               |

---

### GET /auth/:provider/link

Settings > Connected accounts "Connect" — `:provider` is `google`, `github`, or `linkedin`. Returns a plain JSON URL rather than redirecting: a browser's top-level navigation to the provider's consent screen can't carry an `Authorization` header, so this must be called as an authenticated XHR first, with the frontend doing `window.location.href = url` itself afterward. The URL embeds a short-lived (10m) link-intent token as the OAuth `state` param so the shared callback below links the resulting profile to _this_ caller's account instead of running the usual find-or-create-by-email login.

- **Auth**: Bearer JWT required (`JwtAuthGuard`)
- **Path params**: `provider` — `google` \| `github` \| `linkedin`

**Success response — `200 OK`**

```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=..."
}
```

**Errors**: `400` validation failure (unrecognized `provider`); `401` no/invalid token.

**Callback behavior when a link-intent `state` is present** (`GET /auth/:provider/callback`, same routes as the plain sign-in flow above): instead of issuing a token, links the `Account` row to the intent's `sub` and redirects to:

| Outcome                                                                      | Redirect                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Linked (or already linked to this same account — a no-op)                    | `<FRONTEND_URL>/settings?connected=<provider>`                             |
| That external account is already linked to a **different** RemoteSEA account | `<FRONTEND_URL>/settings?connectionError=<provider>&reason=already_linked` |
| Any other failure                                                            | `<FRONTEND_URL>/settings?connectionError=<provider>&reason=unknown`        |

A link-intent token is rejected by `JwtStrategy` the same way a 2FA challenge token is (both carry a `purpose` claim) — it can never be used as a real Bearer token on any other route.

---

### POST /auth/forgot-password

Issues a password-reset token (if the email exists, TTL 1h) and emails a reset link. Always returns the same generic message to prevent user enumeration.

- **Auth**: None · **Rate limit**: 3 req / 60s per IP — `forgot:<ip>`
- **Body**: `email` (string, valid email, required)

**Success response — `200 OK`**

```json
{ "message": "If that email exists, a reset link was sent." }
```

**Errors**: `400` validation failure, `429` rate limit exceeded.

---

### POST /auth/reset-password

Consumes a reset token and sets a new password.

- **Auth**: None (the token is the credential) · **Rate limit**: 5 req / 60s per IP — `reset:<ip>`
- **Body** (`resetPasswordSchema`): `token` (string, min 1, required), `password` (string, min 8, required)

**Success response — `200 OK`**

```json
{ "message": "Password updated" }
```

**Errors**

| Status | Body                                      | Trigger                    |
| ------ | ----------------------------------------- | -------------------------- |
| 400    | flattened Zod error                       | validation failure         |
| 400    | `{ "error": "Invalid or expired token" }` | token not found or expired |
| 429    | rate-limit body                           | too many requests          |

---

## Users

Base path: `/users/me`. **Controller-level** `@UseGuards(JwtAuthGuard)` — every route below requires a valid Bearer JWT (`401 { "error": "Unauthorized" }` otherwise, not repeated per-route).

### PATCH /users/me

Updates the authenticated user's display name.

- **Body**: `name` (string, min 1, max 120, required) — `{ "name": "Jane A. Doe" }`

**Success response — `200 OK`**

```json
{
  "id": "cme8f1a2b0000ug0h9x1n1a2",
  "name": "Jane A. Doe",
  "email": "jane.doe@example.com"
}
```

**Errors**: `400` validation failure.

---

### DELETE /users/me

Permanently deletes the authenticated user's account (cascades to related records).

**Success response — `200 OK`**

```json
{ "success": true }
```

**Errors**: `500` on a concurrent-delete race (Prisma "record not found" isn't translated to an `ApiException`).

---

### POST /users/me/password

Changes the authenticated user's password after verifying the current one.

- **Rate limit**: 5 req / 60s per user — `password:<userId>`
- **Body** (`changePasswordSchema`): `currentPassword` (string, min 1, required), `newPassword` (string, min 8, required)

**Success response — `200 OK`**

```json
{ "message": "Password updated" }
```

**Errors**

| Status | Body                                                                           | Trigger                                   |
| ------ | ------------------------------------------------------------------------------ | ----------------------------------------- |
| 400    | flattened Zod error                                                            | validation failure                        |
| 400    | `{ "error": "Password change is not available for social sign-in accounts." }` | account has no password hash (OAuth-only) |
| 400    | `{ "error": "Current password is incorrect" }`                                 | wrong `currentPassword`                   |
| 429    | rate-limit body                                                                | too many requests                         |

---

### GET /users/me/account

Reads the current Settings > Account field values.

**Success response — `200 OK`**

```json
{
  "id": "cme8f1a2b0000ug0h9x1n1a2",
  "phone": null,
  "language": "English",
  "region": "Vietnam",
  "currencyDisplay": "USD ($)",
  "image": null
}
```

---

### PATCH /users/me/account

Updates Settings > Account fields. Partial — at least one field required. `phone`/`language`/`region`/`currencyDisplay` are persisted display preferences with no other reader yet (no i18n/locale switching or currency-formatting logic in the app currently consumes them). `image` backs the Profile setup avatar.

- **Body** (`updateAccountSchema`, all optional but ≥1 required):

| Field             | Type           | Constraints                                                                                                         |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `phone`           | string         | max 30; `""` clears it (stored as `null`)                                                                           |
| `language`        | enum           | `"English"` \| `"Tiếng Việt"`                                                                                       |
| `region`          | enum           | `"Vietnam"` \| `"Singapore"` \| `"Australia"`                                                                       |
| `currencyDisplay` | enum           | `"USD ($)"` \| `"VND (₫)"` \| `"SGD (S$)"`                                                                          |
| `image`           | string \| null | Must be a URL from this account's own `POST /uploads/presign` (`type: "avatar"`) response; `null` removes the photo |

**Success response — `200 OK`**

```json
{
  "id": "cme8f1a2b0000ug0h9x1n1a2",
  "phone": "+84 90 123 4567",
  "language": "English",
  "region": "Vietnam",
  "currencyDisplay": "USD ($)",
  "image": "https://cdn.remotesea.io/uploads/avatar/cme8f1a2b0000ug0h9x1n1a2/photo.jpg"
}
```

**Errors**: `400` validation failure (including submitting an empty body, or `image` that isn't a URL this account obtained from its own presign call — `UPLOAD_URL_NOT_OWNED`).

---

### GET /users/me/notification-preferences

Returns Settings > Notifications toggles, creating a default row on first read if none exists yet. Nothing in the app currently sends a notification gated by these — this is a persisted preference with no reader yet.

**Success response — `200 OK`**

```json
{
  "id": "clx4notifpref0001",
  "userId": "cme8f1a2b0000ug0h9x1n1a2",
  "applicationUpdates": true,
  "employerMessages": true,
  "weeklyDigest": true,
  "instantMatchAlerts": true,
  "productNews": false,
  "tipsAndResources": true,
  "browserPush": true,
  "updatedAt": "2026-07-28T10:00:00.000Z"
}
```

---

### PATCH /users/me/notification-preferences

Updates one or more toggles above (upserts the row if it doesn't exist yet).

- **Body** (`updateNotificationPreferencesSchema`): any of `applicationUpdates`, `employerMessages`, `weeklyDigest`, `instantMatchAlerts`, `productNews`, `tipsAndResources`, `browserPush` (all `boolean`, ≥1 required)

**Success response — `200 OK`** — same shape as the `GET` above.

**Errors**: `400` validation failure (including submitting an empty body).

---

### GET /users/me/pause

Reads the current pause state (so the Settings UI shows "Pause" vs. "Reactivate" correctly on load, not just right after an action).

**Success response — `200 OK`**

```json
{ "isPaused": false }
```

---

### POST /users/me/pause

Settings > Danger zone "Pause my account" — reversible, unlike `DELETE /users/me`. Sets `isPaused: true` and stamps `pausedAt`. Does **not** block sign-in (the user needs to be able to log back in to reactivate) and nothing else in the app currently checks this flag — a paused user's public profile, jobs, etc. all behave exactly as before.

**Success response — `200 OK`**

```json
{
  "id": "cme8f1a2b0000ug0h9x1n1a2",
  "isPaused": true,
  "pausedAt": "2026-07-28T10:00:00.000Z"
}
```

---

### POST /users/me/reactivate

Reverses `POST /users/me/pause` — sets `isPaused: false`, clears `pausedAt`.

**Success response — `200 OK`**

```json
{ "id": "cme8f1a2b0000ug0h9x1n1a2", "isPaused": false, "pausedAt": null }
```

---

### GET /users/me/export

Settings > Privacy & data "Download your data". Assembles the account's own data — profile, applications (talent side) or company profile + job postings (employer side), and job alerts — as a single JSON payload. Excludes internal-only fields (`passwordHash`, `stripeSessionId`, `reviewNote`, etc.).

**Success response — `200 OK`**

```json
{
  "exportedAt": "2026-07-28T10:00:00.000Z",
  "account": {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "phone": null,
    "role": "TALENT",
    "createdAt": "2026-01-15T09:12:00.000Z",
    "talent": { "...": "profile + skills + applications, or null" },
    "employer": { "...": "company profile + jobs, or null" },
    "jobAlerts": []
  }
}
```

---

### GET /users/me/connections

Settings > Connected accounts. Lists linked OAuth providers (Google, GitHub, LinkedIn — see `GET /auth/:provider/link` to connect a new one).

**Success response — `200 OK`**

```json
[
  { "provider": "google", "providerAccountId": "104852..." },
  { "provider": "github", "providerAccountId": "8213455" }
]
```

---

### DELETE /users/me/connections/:provider

Unlinks an OAuth provider. Blocked if this would leave the account with no way to sign in (no password set **and** this is the only connected provider).

- **Path params**: `provider` (string, e.g. `google`, `github`)

**Success response — `200 OK`**

```json
{ "success": true }
```

**Errors**

| Status | Body                                                                                                        | Trigger                              |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 400    | `{ "error": "That provider isn't connected to this account" }`                                              | no `Account` row for that provider   |
| 409    | `{ "error": "Set a password or keep at least one other connected account before disconnecting this one." }` | would remove the only sign-in method |

---

### GET /users/me/sessions

Settings > Security > Active sessions. Every `POST /auth/login` (or the 2FA/OAuth equivalents) creates a `Session` row whose id becomes the issued JWT's `sid` claim — `JwtStrategy` rejects any token whose session is missing or revoked, on every authenticated request. This lists the caller's own non-revoked sessions, newest-activity first, with `device` parsed from the request's `User-Agent` and `location` resolved from the stored IP — both computed at read time (not stored pre-formatted), and `current: true` on whichever session this very request's own token belongs to.

`location` is an offline MaxMind GeoLite2 lookup (`geoip-lite` — no network call, no API key, no rate limit) formatted as `"City, Region, Country"` and trimmed down to whatever precision is actually available (frequently just the country, or `null`). It's `null` for loopback/private ranges (`::1`, `127.0.0.1`, `10.x`, `192.168.x`) — the normal case in local development — and for any IP the offline database doesn't recognize.

**Success response — `200 OK`**

```json
[
  {
    "id": "cms4iborq0003exhoppxthw5w",
    "device": "Chrome on macOS",
    "ip": "203.0.113.4",
    "location": "Ho Chi Minh City, Vietnam",
    "createdAt": "2026-07-28T10:22:38.631Z",
    "lastSeenAt": "2026-07-28T10:22:38.631Z",
    "current": true
  },
  {
    "id": "cms4ibppt0005exhovc4ptk20",
    "device": "Safari on iOS",
    "ip": "203.0.113.9",
    "location": null,
    "createdAt": "2026-07-28T10:22:39.857Z",
    "lastSeenAt": "2026-07-28T10:25:12.001Z",
    "current": false
  }
]
```

---

### DELETE /users/me/sessions/:id

Revokes one other session immediately — its access token stops working on the very next request (checked in `JwtStrategy.validate`, not just at next-login). Blocked for the caller's own current session; use normal sign-out for that instead.

- **Path params**: `id` (string, a `Session` id)

**Success response — `200 OK`**

```json
{ "success": true }
```

**Errors**

| Status | Body                                                                               | Trigger                                            |
| ------ | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| 400    | `{ "error": "Sign out to end your current session instead of revoking it here." }` | `id` is the caller's own current session           |
| 404    | `{ "error": "Session not found" }`                                                 | no matching non-revoked session owned by this user |

---

### DELETE /users/me/sessions

"Sign out of all other sessions." Revokes every one of the caller's sessions except the current one.

**Success response — `200 OK`**

```json
{ "revokedCount": 2 }
```

---

## Talent

Base path: `/talent`. No class-level guard — auth applied per-route.

### GET /talent/me

Returns the authenticated user's own talent profile with skills, work experience, profile highlights, and their name.

- **Auth**: Bearer JWT required

**Success response — `200 OK`**

```json
{
  "id": "clx4talent0001abcd",
  "userId": "cme8f1a2b0000ug0h9x1n1a2",
  "slug": "jane-doe-a1b2c3",
  "headline": "Senior Backend Engineer",
  "bio": "8 years building distributed systems in Go and TypeScript.",
  "location": "Ho Chi Minh City",
  "country": "Vietnam",
  "timezone": "Asia/Ho_Chi_Minh",
  "yearsExperience": 8,
  "level": "SENIOR",
  "resumeUrl": "https://example.com/resume.pdf",
  "portfolioUrl": "https://janedoe.dev",
  "githubUrl": "https://github.com/janedoe",
  "linkedinUrl": "https://linkedin.com/in/janedoe",
  "isOpenToWork": true,
  "visibility": "PUBLIC",
  "primaryRole": "Software Engineer · Frontend",
  "rightToWork": "Vietnam only",
  "employmentTypes": ["FULL_TIME", "CONTRACT"],
  "timezoneOverlap": ["SG_HOURS", "AU_HOURS"],
  "noticePeriod": "2 weeks",
  "desiredSalaryMin": 90000,
  "desiredSalaryMax": 130000,
  "currency": "USD",
  "createdAt": "2026-01-15T09:12:00.000Z",
  "updatedAt": "2026-06-30T14:02:31.000Z",
  "skills": [
    {
      "talentId": "clx4talent0001abcd",
      "skillId": "clx4skill0001node",
      "yearsExp": 6,
      "skill": {
        "id": "clx4skill0001node",
        "name": "Node.js",
        "slug": "node-js"
      }
    }
  ],
  "workExperiences": [
    {
      "id": "cme8f1a2b0000ug0h9x1n1a5",
      "talentId": "clx4talent0001abcd",
      "company": "Finch Labs",
      "title": "Frontend Engineer",
      "location": "Singapore",
      "startDate": "2023-05-01T00:00:00.000Z",
      "endDate": null,
      "description": "Built the merchant onboarding flow for Finch's payment APIs.",
      "createdAt": "2026-01-15T09:12:00.000Z",
      "updatedAt": "2026-01-15T09:12:00.000Z"
    }
  ],
  "profileHighlights": [
    {
      "id": "cme8f1a2b0000ug0h9x1n1a6",
      "talentId": "clx4talent0001abcd",
      "type": "PORTFOLIO",
      "title": "Merchant onboarding flow",
      "subtitle": "Lead engineer · 4 months",
      "description": "Reworked a multi-step KYC flow into a single-page progressive form.",
      "tag": "Product · Production",
      "url": "https://github.com/janedoe/project",
      "startYear": null,
      "endYear": null,
      "createdAt": "2026-01-15T09:12:00.000Z",
      "updatedAt": "2026-01-15T09:12:00.000Z"
    }
  ],
  "user": { "name": "Jane Doe" }
}
```

**Errors**: `401` no/invalid token; `404 { "error": "Profile not found" }` if the user has no `TalentProfile`.

---

### PUT /talent/me

Creates or updates the authenticated user's talent profile (upsert); if `skills` is provided, fully replaces the skill list (transactional delete-then-insert).

- **Auth**: Bearer JWT required
- **Body** (`talentProfileSchema`, every field optional — partial upsert):

| Field                                                   | Type    | Constraints                                                                                                                                                                  |
| ------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headline`                                              | string  | max 120                                                                                                                                                                      |
| `bio`                                                   | string  | max 2000                                                                                                                                                                     |
| `location`, `country`, `timezone`                       | string  | —                                                                                                                                                                            |
| `yearsExperience`                                       | number  | integer, min 0                                                                                                                                                               |
| `level`                                                 | enum    | `ENTRY`\|`MID`\|`SENIOR`\|`LEAD`\|`EXECUTIVE`                                                                                                                                |
| `resumeUrl`, `portfolioUrl`, `githubUrl`, `linkedinUrl` | string  | valid URL                                                                                                                                                                    |
| `isOpenToWork`                                          | boolean | —                                                                                                                                                                            |
| `visibility`                                            | enum    | `PUBLIC` \| `VERIFIED_EMPLOYERS` — see `GET /talent/:slug` below; defaults to `PUBLIC`                                                                                       |
| `primaryRole`                                           | enum    | `"Software Engineer · Frontend"` \| `"Software Engineer · Backend"` \| `"Software Engineer · Full-stack"` \| `"Product Designer"` \| `"Product Manager"` \| `"Data Analyst"` |
| `rightToWork`                                           | enum    | `"Vietnam only"` \| `"Vietnam + Singapore"` \| `"Vietnam + Australia"` \| `"Open to relocation / sponsorship"`                                                               |
| `employmentTypes`                                       | array   | any of `"FULL_TIME"`, `"CONTRACT"`, `"PART_TIME"`; replaces the entire set, not a per-item toggle                                                                            |
| `timezoneOverlap`                                       | array   | any of `"SG_HOURS"`, `"AU_HOURS"`, `"ASYNC_ONLY"`; replaces the entire set, not a per-item toggle                                                                            |
| `noticePeriod`                                          | enum    | `"Immediate"` \| `"2 weeks"` \| `"1 month"` \| `"2+ months"`                                                                                                                 |
| `desiredSalaryMin`, `desiredSalaryMax`                  | number  | integer, positive                                                                                                                                                            |
| `skills`                                                | array   | `{ skillId: string (CUID), yearsExp?: number (int, min 0) }[]`; provided → replaces entire skill set; omitted → untouched; `[]` → clears                                     |

```json
{
  "headline": "Senior Backend Engineer",
  "level": "SENIOR",
  "isOpenToWork": true,
  "skills": [{ "skillId": "clx4skill0001node", "yearsExp": 6 }]
}
```

**Success response — `200 OK`** — same shape as `GET /talent/me` but **without** the `user` field (the upsert re-fetch only includes `skills.skill`).

**Notes**

- `slug` is only set on first creation; later `PUT`s never change it.
- `level` defaults to `MID` and `currency` always defaults to `USD` on first creation; `currency` cannot be set via this endpoint.

**Errors**: `400` validation failure; `401` no/invalid token; `500` if the user row no longer exists (stale token after account deletion).

---

### GET /talent/:slug

Public talent profile lookup by slug. Hides compensation fields unless `isOpenToWork` is `true`. Gated by the profile's `visibility` setting (Settings > Privacy & data): a `PUBLIC` profile (the default) is visible to anyone; a `VERIFIED_EMPLOYERS` profile only to a caller sending a Bearer JWT for a user with `role: EMPLOYER` whose `EmployerProfile.isVerified` is `true`.

- **Auth**: None required, but an `Authorization: Bearer <jwt>` header is read if present — the only route in the app that's unauthenticated yet optionally auth-aware
- **Path params**: `slug` (string)

**Success response — `200 OK`** — same shape as the profile above, but `user` is `{ name, image }`; `visibility` is never included (own-profile only, since it exists purely to gate this route); and `desiredSalaryMin`/`Max` keys are **omitted entirely** (not `null`) when `isOpenToWork` is `false`. `primaryRole`/`rightToWork`/`employmentTypes`/`timezoneOverlap`/`noticePeriod`, `workExperiences` (current role first, then most-recently-started), and `profileHighlights` (Selected work / Education / Languages, oldest first) ARE included — none of these are sensitive.

**Errors**: `404 { "error": "Profile not found" }` — both for a nonexistent slug and for a `VERIFIED_EMPLOYERS` profile the caller isn't allowed to see (same response either way, so a gated profile's existence isn't revealed to a caller who can't view it).

---

## Work Experience

Base path: `/talent/me/experience`. Profile setup "Experience" section — up to 5 entries per talent profile. These CRUD routes are own-profile only; the entries themselves are also readable via `GET /talent/:slug`'s `workExperiences` field.

### GET /talent/me/experience

Lists the current user's work-experience entries — current roles (`endDate: null`) first, then most-recently-started first.

- **Auth**: Bearer JWT required

**Success response — `200 OK`**

```json
[
  {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "talentId": "cme8f1a2b0000ug0h9x1n1a3",
    "company": "Finch Labs",
    "title": "Frontend Engineer",
    "location": "Singapore",
    "startDate": "2023-05-01T00:00:00.000Z",
    "endDate": null,
    "description": "Built the merchant onboarding flow for Finch's payment APIs.",
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-01T10:00:00.000Z"
  }
]
```

Returns `[]` (not an error) if the caller has no `TalentProfile` yet.

**Errors**: `401` no/invalid token.

---

### POST /talent/me/experience

Creates a new work-experience entry on the caller's talent profile.

- **Auth**: Bearer JWT required
- **Body** (`createWorkExperienceSchema`):

| Field         | Type   | Constraints                                                |
| ------------- | ------ | ---------------------------------------------------------- |
| `company`     | string | required, 1–120 chars, trimmed                             |
| `title`       | string | required, 1–120 chars, trimmed                             |
| `location`    | string | optional, max 120 chars                                    |
| `startDate`   | date   | required (ISO 8601 or anything `Date` can parse)           |
| `endDate`     | date   | optional — omit for a current role (rendered as "Present") |
| `description` | string | optional, max 1000 chars                                   |

```json
{
  "company": "Finch Labs",
  "title": "Frontend Engineer",
  "location": "Singapore",
  "startDate": "2023-05-01T00:00:00.000Z",
  "description": "Built the merchant onboarding flow for Finch's payment APIs."
}
```

**Success response — `201 Created`** — same shape as `GET` above.

**Errors**: `400` validation failure (including `endDate` before `startDate`); `401`; `403 { "error": "Talent profile required" }` if the caller has no `TalentProfile` yet (create one via `PUT /talent/me` first); `409 { "error": "You can list up to 5 roles — remove one before adding another." }` at the cap.

---

### PATCH /talent/me/experience/:id

Partial update of one entry.

- **Auth**: Bearer JWT required
- **Path params**: `id` (CUID)
- **Body** (`updateWorkExperienceSchema`, all optional but ≥1 required): same fields as create, plus `endDate`/`location`/`description` accept `null` explicitly — `null` on `endDate` clears it back to a current role; omitting a field leaves it unchanged.

**Success response — `200 OK`** — same shape as `GET` above.

**Errors**: `400` validation failure (including submitting an empty body, or `endDate` before `startDate`); `401`; `404 { "error": "Work experience not found" }` — both for a nonexistent id and for another user's entry (ownership enforced by `WorkExperienceOwnershipGuard`, not revealed to a non-owner).

---

### DELETE /talent/me/experience/:id

Deletes one entry.

- **Auth**: Bearer JWT required
- **Path params**: `id` (CUID)

**Success response — `200 OK`**

```json
{ "success": true }
```

**Errors**: `401`; `404 { "error": "Work experience not found" }` (same ownership semantics as `PATCH` above).

---

## Profile Highlights

Base path: `/talent/me/highlights`. Backing model: `ProfileHighlight` — one table backs all three of the Profile setup "Selected work" (`type: PORTFOLIO`), "Education" (`type: EDUCATION`), and "Languages" (`type: LANGUAGE`) sections; which fields are meaningful depends on `type` (see the field table below). Capped at 5 entries **per `type`** (not 5 total). These CRUD routes are own-profile only; the entries themselves are also readable via `GET /talent/:slug`'s `profileHighlights` field.

### GET /talent/me/highlights

Lists the current user's highlight entries — all types together, oldest first (group by `type` client-side to render the three sections).

- **Auth**: Bearer JWT required

**Success response — `200 OK`**

```json
[
  {
    "id": "cme8f1a2b0000ug0h9x1n1a2",
    "talentId": "cme8f1a2b0000ug0h9x1n1a3",
    "type": "PORTFOLIO",
    "title": "Merchant onboarding flow",
    "subtitle": "Lead engineer · 4 months",
    "description": "Reworked a multi-step KYC flow into a single-page progressive form.",
    "tag": "Product · Production",
    "url": "https://github.com/janedoe/project",
    "startYear": null,
    "endYear": null,
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-01T10:00:00.000Z"
  }
]
```

Returns `[]` (not an error) if the caller has no `TalentProfile` yet.

**Errors**: `401` no/invalid token.

---

### POST /talent/me/highlights

Creates a new highlight entry. `type` is required and immutable after creation — it decides which of the remaining fields are meaningful.

- **Auth**: Bearer JWT required
- **Body** (`createProfileHighlightSchema`, a Zod discriminated union on `type`):

| Field         | Type   | Applies to  | Constraints                                                        |
| ------------- | ------ | ----------- | ------------------------------------------------------------------ |
| `type`        | enum   | all         | `PORTFOLIO` \| `EDUCATION` \| `LANGUAGE`, required                 |
| `title`       | string | all         | required, trimmed — project title / school name / language name    |
| `subtitle`    | string | all         | optional, trimmed — role · duration / degree · field / proficiency |
| `description` | string | `PORTFOLIO` | optional, max 500 chars                                            |
| `tag`         | string | `PORTFOLIO` | optional, max 60 chars — e.g. "Product · Production"               |
| `url`         | string | `PORTFOLIO` | optional, valid http(s) URL                                        |
| `startYear`   | number | `EDUCATION` | required for `EDUCATION`, 1950–(current year + 1)                  |
| `endYear`     | number | `EDUCATION` | optional — omit for an ongoing program; must be ≥ `startYear`      |

```json
{
  "type": "PORTFOLIO",
  "title": "Merchant onboarding flow",
  "subtitle": "Lead engineer · 4 months",
  "description": "Reworked a multi-step KYC flow into a single-page progressive form.",
  "tag": "Product · Production",
  "url": "https://github.com/janedoe/project"
}
```

**Success response — `201 Created`** — same shape as `GET` above.

**Errors**: `400` validation failure (including `endYear` before `startYear`); `401`; `403 { "error": "Talent profile required" }` if the caller has no `TalentProfile` yet (create one via `PUT /talent/me` first); `409 { "error": "You can add up to 5 <type> entries — remove one before adding another." }` at the per-type cap.

---

### PATCH /talent/me/highlights/:id

Partial update of one entry. `type` cannot be changed via this route (not part of the body) — the fields accepted are the union of all three types' fields (`title`, `subtitle`, `description`, `tag`, `url`, `startYear`, `endYear`, all optional, `subtitle`/`description`/`tag`/`url`/`endYear` also accept explicit `null` to clear).

- **Auth**: Bearer JWT required
- **Path params**: `id` (CUID)
- **Body** (`updateProfileHighlightSchema`, all optional but ≥1 required)

**Success response — `200 OK`** — same shape as `GET` above.

**Errors**: `400` validation failure (including submitting an empty body); `401`; `404 { "error": "Profile highlight not found" }` — both for a nonexistent id and for another user's entry (ownership enforced by `ProfileHighlightOwnershipGuard`, not revealed to a non-owner).

---

### DELETE /talent/me/highlights/:id

Deletes one entry.

- **Auth**: Bearer JWT required
- **Path params**: `id` (CUID)

**Success response — `200 OK`**

```json
{ "success": true }
```

**Errors**: `401`; `404 { "error": "Profile highlight not found" }` (same ownership semantics as `PATCH` above).

---

## Employer

Base path: `/employer`.

### POST /employer/profile

Creates an employer profile for the authenticated user and promotes their `User.role` to `EMPLOYER`. Slug collisions get a random 6-char suffix.

- **Auth**: Bearer JWT required (any role)
- **Body** (`createEmployerProfileSchema`): `companyName` (string, min 2, max 100, required); optional `websiteUrl` (URL), `description`, `industry`, `size`, `hqCountry`, `hqCity`

```json
{
  "companyName": "RemoteSEA Ltd",
  "websiteUrl": "https://remotesea.io",
  "industry": "Technology",
  "hqCountry": "Vietnam"
}
```

**Success response — `201 Created`**

```json
{
  "id": "clx1a2b3c4d5e6f7g8h9i0j1",
  "slug": "remotesea-ltd",
  "companyName": "RemoteSEA Ltd"
}
```

**Errors**: `400` validation failure; `401`; `409 { "error": "Employer profile already exists" }`.

---

### GET /employer/profile

Returns the authenticated employer's profile plus `_count.jobs` and computed `totalApplications`.

- **Auth**: Bearer JWT + `EMPLOYER` role (`RolesGuard`)

**Success response — `200 OK`**

```json
{
  "id": "clx1a2b3c4d5e6f7g8h9i0j1",
  "companyName": "RemoteSEA Ltd",
  "slug": "remotesea-ltd",
  "isVerified": false,
  "_count": { "jobs": 4 },
  "totalApplications": 27
}
```

**Errors**: `401`; `403 { "error": "Forbidden" }` (wrong role); `404 { "error": "Profile not found" }`.

---

### PATCH /employer/profile

Updates fields on the authenticated employer's profile. All fields optional: `companyName`, `websiteUrl`, `description`, `industry`, `size`, `founded` (int), `hqCountry`, `hqCity`, `logoUrl` (URL).

- **Auth**: Bearer JWT + `EMPLOYER` role

**Success response — `200 OK`** — full updated `EmployerProfile`.

**Errors**: `400`; `401`; `403`; `404 { "error": "Profile not found" }`.

---

### GET /employer/jobs

Lists jobs owned by the authenticated employer, optionally filtered by status, plus aggregate hiring stats.

- **Auth**: Bearer JWT + `EMPLOYER` role
- **Query**: `status` (enum, optional) — `DRAFT`\|`PENDING_REVIEW`\|`ACTIVE`\|`CLOSED`\|`REJECTED`

**Success response — `200 OK`**

```json
{
  "jobs": [
    {
      "id": "cljob1a2b3c4d5e6f7g8h9i0",
      "title": "Senior Backend Engineer",
      "status": "ACTIVE",
      "viewCount": 342,
      "applyCount": 12,
      "_count": { "applications": 12 }
    }
  ],
  "stats": { "totalApps": 27, "shortlisted": 5, "avgTimeToHireInDays": 6.4 }
}
```

`avgTimeToHireInDays` is computed only over `OFFERED` applications; `0` if none.

**Errors**: `400`; `401`; `403 { "error": "Forbidden" }` (wrong role); `403 { "error": "Employer profile required" }` (`EMPLOYER` role but no profile row).

---

### GET /employer/jobs/:id/applications

Lists paginated applications for a job owned by the caller.

- **Auth**: Bearer JWT required only — **no `@Roles()`**; ownership checked in the service via `job.employer.userId === user.id`
- **Path params**: `id` (Job id)
- **Query**: `status` (enum, optional, one of the 7 `ApplicationStatus` values), `page`, `limit` (pagination defaults)

**Success response — `200 OK`**

```json
{
  "applications": [
    {
      "id": "clapp1a2b3c4d5e6f7g8h9i0",
      "status": "REVIEWING",
      "appliedAt": "2026-06-10T12:00:00.000Z",
      "coverLetter": "I would love to join your team...",
      "talent": {
        "id": "cltal1...",
        "slug": "jane-doe",
        "headline": "Full-stack Developer",
        "level": "SENIOR",
        "user": { "name": "Jane Doe" },
        "skills": []
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 12, "pages": 1 }
}
```

**Errors**: `400`; `401`; `403 { "error": "Forbidden" }` (not the owning employer); `404 { "error": "Job not found" }`.

---

### PATCH /employer/applications/:id

Updates an application's status (and optional notes) under a state machine.

- **Auth**: Bearer JWT required only; ownership via `application.job.employer.userId === user.id`
- **Body** (`updateApplicationSchema`): `status` (enum, required, one of the 7 `ApplicationStatus` values), `notes` (string, max 2000, optional)

Allowed transitions: `PENDING → REVIEWING|REJECTED`; `REVIEWING → SHORTLISTED|REJECTED`; `SHORTLISTED → INTERVIEW|REJECTED`; `INTERVIEW → OFFERED|REJECTED`; `OFFERED → REJECTED`; `REJECTED`/`WITHDRAWN` → none. Setting the same status is always a no-op allowed.

**Success response — `200 OK`** — updated `Application` row.

**Errors**: `400` validation failure or `{ "error": "Cannot transition from PENDING to OFFERED" }` illegal transition; `401`; `403` not owning employer; `404 { "error": "Application not found" }`.

---

## Jobs

Base path: `/jobs`.

### GET /jobs

Public job search/listing — only `status: ACTIVE` jobs already published.

- **Auth**: None
- **Query** (`listJobsSchema`): `q` (string, free-text over title/description), `type` (enum), `level` (enum), `country` (string), `category` (category slug), `page`, `limit`

**Success response — `200 OK`** — jobs ordered `isFeatured desc, publishedAt desc`, each with `employer` (`companyName`, `logoUrl`, `slug`), `categories[].category`, `skills[].skill`, plus `pagination`.

**Errors**: `400` invalid query values.

---

### POST /jobs

Creates a new job in `DRAFT` status for the authenticated employer.

- **Auth**: Bearer JWT required only — no `@Roles()`; service requires an existing `EmployerProfile`
- **Body** (`createJobSchema`):

| Field                    | Type     | Required | Constraints                                              |
| ------------------------ | -------- | -------- | -------------------------------------------------------- |
| `title`                  | string   | yes      | min 5, max 120                                           |
| `description`            | string   | yes      | min 100                                                  |
| `requirements`           | string   | no       | —                                                        |
| `jobType`                | enum     | yes      | `FULL_TIME`\|`PART_TIME`\|`CONTRACT`\|`FREELANCE`        |
| `level`                  | enum     | yes      | `ENTRY`\|`MID`\|`SENIOR`\|`LEAD`\|`EXECUTIVE`            |
| `salaryMin`, `salaryMax` | number   | yes      | positive int; `salaryMax >= salaryMin` (service-checked) |
| `timezone`, `country`    | string   | no       | —                                                        |
| `benefits`               | string[] | no       | max 10, default `[]`                                     |
| `planType`               | enum     | yes      | `STANDARD`\|`FEATURED`\|`HANDS_ON`                       |
| `categoryIds`            | string[] | yes      | CUIDs, 1–3 items                                         |
| `skillIds`               | string[] | no       | CUIDs, max 15, default `[]`                              |

**Success response — `201 Created`**

```json
{
  "id": "cljob1a2b3c4d5e6f7g8h9i0",
  "slug": "senior-backend-engineer-a1b2c3",
  "status": "DRAFT"
}
```

**Errors**: `400` validation or `{ "error": "salaryMax must be greater than or equal to salaryMin" }`; `401`; `403 { "error": "Employer profile required" }`.

---

### GET /jobs/:id

Fetches a single job — only if `status: ACTIVE` (drafts/pending/closed/rejected 404 even for the owner). Fires an async, best-effort `viewCount` increment.

- **Auth**: None
- **Path params**: `id`

**Success response — `200 OK`** — full `Job` record with `employer` (incl. `isVerified`), `categories`, `skills`.

**Errors**: `404 { "error": "Job not found" }`.

---

### PATCH /jobs/:id

Updates a job. `ADMIN` role bypasses all checks; otherwise the caller must own the job (`job.employer.userId === user.id`) **and** the job must be `DRAFT` or `REJECTED`. Cannot change `categoryIds`/`skillIds` here.

- **Auth**: Bearer JWT required only — role/ownership logic lives in the service
- **Body** (`updateJobSchema`, all optional): same fields as `createJobSchema` minus `categoryIds`/`skillIds`

**Success response — `200 OK`** — full updated `Job` record.

**Errors**: `400`; `401`; `403 { "error": "Forbidden" }` (non-admin, not owner); `403 { "error": "Only draft or rejected jobs can be edited" }`; `404 { "error": "Job not found" }`.

---

## Taxonomy

Two controllers: `CategoriesController` (`/categories`), `SkillsController` (`/skills`).

### GET /categories

Lists all job categories, alphabetically, no pagination.

- **Auth**: None

**Success response — `200 OK`**

```json
[
  {
    "id": "clcat1...",
    "name": "Engineering",
    "slug": "engineering",
    "icon": "code"
  }
]
```

---

### GET /skills

Lists skills, optionally filtered by a case-insensitive substring match on `name`; capped at 100 results.

- **Auth**: None
- **Query**: `q` (string, optional, trimmed — empty/omitted returns all up to 100)

**Success response — `200 OK`**

```json
[{ "id": "clskl1...", "name": "TypeScript", "slug": "typescript" }]
```

**Errors**: `400` if `q` fails schema (non-string, unlikely in practice).

---

## Applications

Base path: `/applications`.

### GET /applications

Returns the current user's applications (most recent first), each with the embedded job listing.

- **Auth**: Bearer JWT required

**Success response — `200 OK`** — array of `Application` rows with nested `job` (full job + `employer`, `categories`, `skills`). Returns `[]` if the user has no `TalentProfile` (rather than an error).

**Errors**: `401`.

---

### POST /applications

Submits a job application as the current user's talent profile; increments the job's `applyCount`; emails the employer.

- **Auth**: Bearer JWT required; service requires a `TalentProfile`
- **Rate limit**: 10 req / 60s per user — `apply:<userId>`
- **Body** (`applySchema`): `jobId` (string, CUID, required), `coverLetter` (string, max 5000, optional), `resumeUrl` (string, URL, optional)

**Success response — `201 Created`** — the created `Application` row.

**Errors**

| Status | Body                                     | Trigger                                                        |
| ------ | ---------------------------------------- | -------------------------------------------------------------- |
| 400    | flattened Zod error                      | validation failure                                             |
| 401    | `{ "error": "Unauthorized" }`            | no/invalid token                                               |
| 403    | `{ "error": "Talent profile required" }` | user has no `TalentProfile`                                    |
| 409    | `{ "error": "Already applied" }`         | duplicate `(jobId, talentId)`                                  |
| 429    | rate-limit body                          | too many applications                                          |
| 500    | `{ "error": "Internal server error" }`   | `jobId` references a non-existent job (unhandled FK violation) |

---

## Saved Jobs

Base path: `/saved`.

### GET /saved

Returns the current user's saved jobs (most recent first) with embedded job listings.

- **Auth**: Bearer JWT required

**Success response — `200 OK`** — array of `{ userId, jobId, createdAt, job: {...} }`.

**Errors**: `401`.

---

### POST /saved

**Toggles** save state for a job — saves if not already saved, un-saves (deletes) if it is. Never returns a "409 already saved" — it's a toggle.

- **Auth**: Bearer JWT required
- **Body**: `jobId` (string, CUID, required)

**Success response** — `201 Created` if newly saved (`{ "saved": true }`), `200 OK` if removed (`{ "saved": false }`).

**Errors**: `400` validation failure; `401`; `500` if `jobId` references a non-existent job.

---

## Billing

Base path: `/billing`. Wraps Stripe Checkout for paying to publish a job.

### POST /billing/checkout

Creates a Stripe Checkout session for a `DRAFT`, unpaid job owned by the current user; stores the session id on the job.

- **Auth**: Bearer JWT required
- **Rate limit**: 10 req / 60s per user — `checkout:<userId>`
- **Body**: `jobId` (string, CUID, required)

Line item price from `PLAN_PRICES[job.planType]` (cents): `STANDARD=15000`, `FEATURED=35000`, `HANDS_ON=120000`. `success_url` → `{FRONTEND_URL}/post-job/success?session_id={CHECKOUT_SESSION_ID}`; `cancel_url` → `{FRONTEND_URL}/post-job?job={job.id}`.

**Success response — `201 Created`**

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3..." }
```

**Errors**

| Status | Body                                | Trigger                                 |
| ------ | ----------------------------------- | --------------------------------------- |
| 400    | flattened Zod error                 | validation failure                      |
| 400    | `{ "error": "Job is not payable" }` | job not `DRAFT` or already `planPaid`   |
| 401    | `{ "error": "Unauthorized" }`       | no/invalid token                        |
| 404    | `{ "error": "Job not found" }`      | job doesn't exist / not owned by caller |
| 429    | rate-limit body                     | too many checkout attempts              |

---

### POST /billing/webhook

Stripe webhook receiver. On `checkout.session.completed`, marks the job paid + moves it to `PENDING_REVIEW`, and emails the employer.

- **Auth**: **No JWT/guard** — authenticity verified via Stripe signature (`stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET`). Relies on `rawBody: true` in `main.ts`; do not add body-parsing middleware in front of this route.
- **Headers**: `stripe-signature: <signature>` (required)
- **Body**: raw Stripe `Event` JSON (no Zod schema)

Non-`checkout.session.completed` events, or events missing `metadata.jobId`, are accepted (`200`) but are no-ops.

**Success response — `201 Created`**

```json
{ "received": true }
```

**Errors**

| Status | Body                                   | Trigger                                                        |
| ------ | -------------------------------------- | -------------------------------------------------------------- |
| 400    | `{ "error": "Missing signature" }`     | `stripe-signature` header absent or `rawBody` missing          |
| 400    | `{ "error": "Invalid signature" }`     | signature verification fails                                   |
| 500    | `{ "error": "Internal server error" }` | e.g. job id from a valid event doesn't exist in DB (unhandled) |

---

## Uploads

Base path: `/uploads`. **Controller-level** `@UseGuards(JwtAuthGuard)` — every route requires auth.

### POST /uploads/presign

Generates a presigned S3 `PUT` URL (expires in 300s) plus the resulting public CDN URL, for direct client-side upload.

- **Auth**: Bearer JWT required
- **Body** (`presignSchema`): `type` (enum, required) — `avatar`\|`logo`\|`resume`; `filename` (string, min 1, max 200, required, sanitized); `contentType` (string, required, must be in the allowed set for `type`)

Allowed `contentType`: `avatar`/`logo` → `image/jpeg`, `image/png`, `image/webp`; `resume` → `application/pdf`.

S3 key: `uploads/{type}/{userId}/{Date.now()}-{sanitizedFilename}`.

**Success response — `201 Created`**

```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket-name/uploads/resume/.../1751443200000-resume.pdf?X-Amz-Signature=...",
  "publicUrl": "https://cdn.remotesea.io/uploads/resume/.../1751443200000-resume.pdf",
  "key": "uploads/resume/.../1751443200000-resume.pdf"
}
```

**Errors**

| Status | Body                                      | Trigger                              |
| ------ | ----------------------------------------- | ------------------------------------ |
| 400    | flattened Zod error                       | validation failure                   |
| 400    | `{ "error": "Unsupported content type" }` | `contentType` not allowed for `type` |
| 401    | `{ "error": "Unauthorized" }`             | no/invalid token                     |
| 500    | `{ "error": "Internal server error" }`    | S3 config/credentials error          |

---

## Alerts

Base path: `/alerts`. Backing model: `JobAlert`. Ownership on CRUD routes is enforced in the service (not just a `where userId` filter) — accessing another user's alert returns `404`, not `403`, to avoid leaking existence.

### GET /alerts

Lists the current user's job alerts, most recent first, with linked categories.

- **Auth**: Bearer JWT required

**Success response — `200 OK`** — array of `JobAlert` rows with `categories[].category`.

**Errors**: `401`.

---

### POST /alerts

Creates a new job alert, optionally attaching category filters.

- **Auth**: Bearer JWT required
- **Body** (`createAlertSchema`):

| Field         | Type     | Required             | Constraints / notes                                                            |
| ------------- | -------- | -------------------- | ------------------------------------------------------------------------------ |
| `name`        | string   | yes                  | min 1, max 100                                                                 |
| `keywords`    | string   | no                   | max 200; matched against job `title`/`description` (case-insensitive contains) |
| `jobType`     | enum     | no                   | `FULL_TIME`\|`PART_TIME`\|`CONTRACT`\|`FREELANCE`                              |
| `level`       | enum     | no                   | `ENTRY`\|`MID`\|`SENIOR`\|`LEAD`\|`EXECUTIVE`                                  |
| `salaryMin`   | number   | no                   | positive int; matches jobs with `salaryMin >= value`                           |
| `country`     | string   | no                   | exact match                                                                    |
| `timezone`    | string   | no                   | stored only, not used in matching                                              |
| `frequency`   | enum     | no (default `DAILY`) | `IMMEDIATE`\|`DAILY`\|`WEEKLY`                                                 |
| `categoryIds` | string[] | no                   | CUIDs                                                                          |

**Success response — `201 Created`** — created alert, same shape as `GET /alerts` items.

**Errors**: `400` validation failure; `401`.

---

### PATCH /alerts/:id

Toggles an alert's active state — only `isActive` is mutable here.

- **Auth**: Bearer JWT required
- **Path params**: `id`
- **Body**: `isActive` (boolean, required)

**Success response — `200 OK`** — updated `JobAlert` row (no `categories` include).

**Errors**: `400`; `401`; `404 { "error": "Not found" }` (doesn't exist or belongs to another user).

---

### DELETE /alerts/:id

Deletes an alert owned by the current user.

**Success response — `200 OK`**

```json
{ "success": true }
```

**Errors**: `401`; `404 { "error": "Not found" }`.

---

### GET /alerts/cron/dispatch

Cron-triggered fan-out: scans active alerts, finds newly-published matching jobs since each alert's last send (respecting its frequency gap), emails matches, stamps `lastSentAt`. Meant for an external scheduler, not browser clients.

- **Auth**: **Not JWT** — `CronSecretGuard` does a literal string comparison of the `Authorization` header against the `CRON_SECRET` env var (not JWT verification). Header: `Authorization: Bearer <CRON_SECRET>`.
- **Rate limit**: None

Frequency gaps: `IMMEDIATE`=0, `DAILY`=24h, `WEEKLY`=7d. Matching window is `(lastSentAt, now]` (or `now - gap` on first run); optional filters (`jobType`, `level`, `country`, `salaryMin` as `gte`, `keywords`, `categories`) applied if set on the alert. Up to 10 jobs per alert; zero matches → alert skipped (no email, `lastSentAt` untouched).

**Success response — `200 OK`**

```json
{ "processed": 42, "sent": 7 }
```

**Errors**: `401 { "error": "Unauthorized" }` (missing/incorrect header).

---

## Admin

Base path: `/admin`. **Controller-level** `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("ADMIN")` — every route requires an authenticated `ADMIN` user (`401` no/invalid token, `403 { "error": "Forbidden" }` non-admin role; not repeated per-route).

### GET /admin/employers

Lists employer profiles for moderation with computed job count and total ad spend, paginated.

- **Query** (`listEmployersSchema`): `verified` (`"true"`\|`"false"`, optional filter on `isVerified`), `page`, `limit` (pagination defaults)

**Success response — `200 OK`** — each item includes both raw `_count.jobs` and a duplicated `jobCount`, plus `totalSpend` (sum of `PLAN_PRICES[planType]` over `planPaid: true` jobs).

```json
{
  "employers": [
    {
      "id": "clx1emp...",
      "companyName": "Acme Corp",
      "isVerified": false,
      "user": { "email": "hiring@acme.com" },
      "_count": { "jobs": 4 },
      "jobCount": 4,
      "totalSpend": 50000
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 37, "pages": 2 }
}
```

**Errors**: `400` invalid query.

---

### PATCH /admin/employers/:id

Verifies or suspends an employer. Suspending force-closes (`status: CLOSED`) all of that employer's `ACTIVE` jobs, transactionally.

- **Path params**: `id` (EmployerProfile id)
- **Body**: `action` (enum, required) — `"verify"`\|`"suspend"`

**Success response — `200 OK`**

```json
{ "success": true }
```

**Errors**: `400` validation; `404 { "error": "Employer not found" }`.

---

### GET /admin/jobs

Lists jobs for moderation review, filtered by status, paginated, oldest first (FIFO review queue).

- **Query** (`listJobsSchema`): `status` (enum, default `PENDING_REVIEW`) — `DRAFT`\|`PENDING_REVIEW`\|`ACTIVE`\|`CLOSED`\|`REJECTED`; `page`, `limit`

**Success response — `200 OK`** — jobs with `employer` (partial) and `categories` (no `skills` include), plus `pagination`.

**Errors**: `400` invalid query.

---

### PATCH /admin/jobs/:id

Approves or rejects a job under review. Approve → `status: ACTIVE`, sets `publishedAt`, clears `reviewNote`, emails employer. Reject → `status: REJECTED`, stores `note` as `reviewNote`, emails rejection reason.

- **Path params**: `id` (Job id)
- **Body** (`reviewJobSchema`): `action` (enum, required) — `"approve"`\|`"reject"`; `note` (string, max 2000, optional — rejection reason)

**Success response — `200 OK`** — intentionally partial (repository only selects these two fields):

```json
{ "status": "ACTIVE", "publishedAt": "2026-07-02T10:05:00.000Z" }
```

**Errors**: `400` validation; `404 { "error": "Job not found" }`.
