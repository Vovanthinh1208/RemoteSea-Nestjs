import { transliterate } from "@/common/utils/transliterate";

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

// The S3 key is already made unique by a timestamp prefix at the call site, so
// this is purely about keeping the downloaded filename meaningful — without
// transliterating first, a Vietnamese résumé filename like "sơ yếu lý lịch.pdf"
// became "s__y_u_l__l_ch.pdf" (every accented letter replaced, not just spaces).
export const sanitize = (name: string): string => {
  return transliterate(name).replace(/[^a-zA-Z0-9._-]/g, "_");
};
