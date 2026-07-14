import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),

  // Required — the app cannot run without these.
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
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
