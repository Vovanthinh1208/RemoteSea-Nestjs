# RemoteSEA API

Production-ready NestJS backend for RemoteSEA, a remote job platform for Southeast Asia. This service is a migration of the original Next.js App Router API routes (`remotesea/src/app/api/**`) into a modular, layered NestJS application, preserving endpoint paths, request/response shapes, status codes, validation rules, and business logic while adopting a scalable Clean Architecture / DDD-inspired structure.

## Tech stack

- **NestJS 10** — REST API framework
- **TypeScript 5** — strict mode
- **Prisma 5** — PostgreSQL ORM (schema shared with the original Next.js app)
- **Passport + JWT** — authentication (replaces NextAuth's session handling)
- **Zod** — request validation, ported verbatim from the original Next.js Zod schemas so error response shapes stay byte-identical
- **Stripe** — job listing payments
- **AWS S3** — presigned file uploads (avatars, logos, resumes)
- **Resend** — transactional email

## Architecture

```
src/
├── main.ts                 # bootstrap, global filters, CORS, raw-body support (Stripe webhooks)
├── app.module.ts            # root module wiring every feature module
│
├── core/                    # cross-cutting framework infrastructure
│   ├── config/               # Zod-validated environment config
│   ├── database/             # PrismaService singleton
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   ├── decorators/            # @CurrentUser(), @Roles()
│   ├── pipes/                  # ZodValidationPipe
│   └── filters/                # GlobalExceptionFilter → { error } response shape
│
├── common/                  # shared, reusable building blocks
│   ├── exceptions/            # ApiException hierarchy (Unauthorized/Forbidden/NotFound/Conflict/...)
│   ├── services/               # EmailService, RateLimitService (globally provided)
│   ├── constants/              # cross-module constants (e.g. plan pricing)
│   ├── interfaces/             # AuthenticatedUser, JwtPayload
│   └── types/                   # shared response/type shapes
│
└── modules/                 # one folder per business domain
    ├── auth/                  # register, login, OAuth (Google/GitHub), session, password reset
    ├── users/                  # account self-service (update name, delete account, change password)
    ├── talent/                 # talent profile (self + public lookup by slug)
    ├── employer/                # employer profile + job/application management dashboard
    ├── jobs/                    # public job board + job creation/editing
    ├── taxonomy/                 # categories + skills reference data
    ├── applications/              # talent job applications
    ├── saved/                     # saved/bookmarked jobs
    ├── admin/                     # platform moderation (employer verification, job approval)
    ├── alerts/                     # job alert subscriptions + cron dispatch
    ├── billing/                    # Stripe checkout + webhook
    ├── uploads/                     # S3 presigned upload URLs
    └── health/                      # liveness/readiness check
```

Each module follows the same internal layering:

- **Controller** — routes, guards, request parsing only. Never touches Prisma.
- **Service** — business logic, authorization checks, orchestration. Never touches Prisma directly (delegates to the Repository), never touches HTTP request/response objects.
- **Repository** — Prisma queries only (`select`/`include` shaped to match the original API responses exactly). No business logic.
- **dto/** — Zod schemas + inferred types, validated via `ZodValidationPipe`.

## Key design decisions

- **Zod instead of class-validator.** The original Next.js app returns `{ error: parsed.error.flatten() }` on invalid input. To keep API consumers working unmodified, every DTO reuses the original Zod schema and a shared `ZodValidationPipe` — not class-validator, which would produce a different error shape.
- **Custom exception hierarchy.** All thrown errors are `ApiException` subclasses (`UnauthorizedApiException`, `ForbiddenApiException`, `NotFoundApiException`, `ConflictApiException`, `BadRequestApiException`, `ValidationApiException`, `TooManyRequestsApiException`). A `GlobalExceptionFilter` renders every error as `{ error: <string|object> }`, matching the original `NextResponse.json({ error }, { status })` contract exactly.
- **JWT/Passport instead of NextAuth.** `POST /auth/login` issues a JWT; `GET /auth/google` and `GET /auth/github` (+ `/callback`) replicate OAuth sign-in and only register as routes when their credentials are configured; `GET /auth/session` mirrors reading the current session from a bearer token.
- **Repository-owned transactions.** Multi-step atomic writes (e.g. suspending an employer + closing their active jobs, replacing a talent's skill list) live in a single repository method that owns `prisma.$transaction([...])` internally — services never call Prisma directly.
- **Rate limiting.** Ported from the original in-memory fixed-window limiter (`RateLimitService`), applied to the same endpoints with the same limits (register, login-adjacent flows, password change, job applications, checkout).

## Getting started

```bash
cp .env.example .env      # fill in secrets (see below)
npm install
npm run db:generate       # generate the Prisma client
npm run db:deploy         # apply existing migrations to your database
npm run start:dev         # http://localhost:4000
```

This service is designed to share a PostgreSQL database with the original Next.js app (same Prisma schema, same migration history in `prisma/migrations`). Point `DATABASE_URL` at the same database, or run `docker compose up -d` from the sibling `remotesea` repo to start a local Postgres instance.

## Environment variables

See `.env.example` for the full list. Required: `DATABASE_URL`, `AUTH_SECRET`. Everything else (Google/GitHub OAuth, Stripe, Resend, S3) is optional and the corresponding features degrade gracefully — routes for unconfigured OAuth providers simply aren't registered, and Stripe/S3/email calls only fail at request time if hit without credentials.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` | ESLint (auto-fix) |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create + apply a new migration (dev) |
| `npm run db:deploy` | Apply existing migrations (CI/prod) |

## API surface

44 routes across 13 modules — endpoint-for-endpoint parity with the original `remotesea/src/app/api/**` route handlers. See each module's `*.controller.ts` for the exact route list, or run the app and check the Nest bootstrap log, which prints every mapped route.
