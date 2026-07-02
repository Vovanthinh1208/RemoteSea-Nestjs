export const STRIPE_CLIENT = "STRIPE_CLIENT";

export const RATE_LIMITS = {
  CHECKOUT: { limit: 10, windowMs: 60_000 },
} as const;
