export const S3_CLIENT = "S3_CLIENT";

// Each presigned URL is a real, usable upload grant against paid S3 storage/egress —
// unlike other rate-limited endpoints (apply, checkout), presign had no throttle at all.
export const RATE_LIMITS = {
  PRESIGN: { limit: 20, windowMs: 60_000 },
} as const;

export const CONTENT_TYPES = {
  avatar: ["image/jpeg", "image/png", "image/webp"],
  logo: ["image/jpeg", "image/png", "image/webp"],
  resume: ["application/pdf"],
} as const;

export const MAX_FILE_SIZE_BYTES = {
  avatar: 5 * 1024 * 1024,
  logo: 5 * 1024 * 1024,
  resume: 10 * 1024 * 1024,
} as const;

export function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
