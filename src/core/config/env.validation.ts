import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),

  // Required — the app cannot run without these.
  DATABASE_URL: z.string().url(),
  // Prisma sizes its connection pool from these two URL params; when unset it
  // defaults to num_CPUs × 2 + 1 connections, which silently varies per machine
  // and can exhaust a hosted Postgres's connection budget (e.g. Supabase's
  // session-mode pooler holds one real DB connection per pooled client
  // connection). These knobs make the pool explicit without editing the
  // DATABASE_URL secret itself: when set, PrismaService appends them to the
  // datasource URL as connection_limit / pool_timeout (seconds). Unset = the
  // exact Prisma defaults, same behavior as before these existed.
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().min(1).optional(),
  DATABASE_POOL_TIMEOUT: z.coerce.number().int().min(0).optional(),
  // Seconds before Postgres cancels a running statement. Unset = no timeout
  // (Prisma/Postgres default), same as today. A lock-contended or runaway
  // query with no timeout holds its pool connection indefinitely — under load
  // that queues every other request behind it just to acquire a connection.
  DATABASE_STATEMENT_TIMEOUT: z.coerce.number().int().min(1).optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  // Extra origins CORS should also accept, beyond FRONTEND_URL — comma-
  // separated (e.g. "https://remotesea-web.fly.dev,https://preview.example.com").
  // Deliberately separate from FRONTEND_URL, not a list-ified version of it:
  // FRONTEND_URL is also the single canonical redirect target for OAuth
  // callbacks (auth.controller.ts), billing return URLs (billing.service.ts),
  // and email links (email.service.ts) — those need exactly one URL, not a
  // set, so overloading it to accept a list would break all three. This
  // exists for running a second frontend deployment (a parallel host
  // migration, a preview environment) that only needs API access, not to be
  // the OAuth/email/billing target. Unset = CORS behavior unchanged from
  // before this existed (FRONTEND_URL only).
  ADDITIONAL_CORS_ORIGINS: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("30d"),
  // Number of reverse-proxy hops in front of this app (load balancer, CDN, etc.) —
  // passed to Express's `trust proxy` setting so req.ip resolves to the real client
  // IP instead of the last proxy's, which the per-IP rate limiter depends on. Trusting
  // more hops than actually exist lets a client spoof X-Forwarded-For and bypass
  // rate limiting entirely, so this must match the real deployment topology, not be
  // set generously "to be safe." Defaults to 1 (a single load balancer/reverse proxy),
  // the common case for this kind of deployment (Railway/Render/Fly.io/a single nginx).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

  // Optional integrations — features degrade gracefully when unset.
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GOOGLE_CALLBACK_URL: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  AUTH_GITHUB_CALLBACK_URL: z.string().optional(),
  AUTH_LINKEDIN_ID: z.string().optional(),
  AUTH_LINKEDIN_SECRET: z.string().optional(),
  AUTH_LINKEDIN_CALLBACK_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  CDN_URL: z.string().optional(),
  // AI features (CV analysis, etc.) — unset API keys mean the feature 503s
  // rather than the app failing to boot, same convention as every other
  // optional integration above. AI_PROVIDER picks which one AiService
  // delegates to (see ai.service.ts); only that provider's key needs to
  // actually be set for AI features to work — the other can stay empty.
  AI_PROVIDER: z.enum(["ANTHROPIC", "GEMINI"]).default("ANTHROPIC"),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // remotesea-ai (separate FastAPI/Python service — the AI Orchestrator,
  // RAG, and Qwen inference live there, not here) — unset means
  // AiOrchestratorService reports the integration as not configured rather
  // than the app failing to boot, same convention as the AI keys above.
  // AI_SERVICE_SECRET must be the exact same value configured on
  // remotesea-ai's side: it's both the legacy bearer secret for its
  // pre-orchestrator endpoints and the HS256 signing key this service uses
  // to mint short-lived per-request orchestrator context tokens (see
  // AiOrchestratorService.mintContextToken).
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  AI_SERVICE_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid environment variables:\n${JSON.stringify(issues, null, 2)}`,
    );
  }
  return parsed.data;
}
