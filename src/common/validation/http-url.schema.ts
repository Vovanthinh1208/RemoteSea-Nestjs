import { z } from "zod";

/**
 * A URL that must use the http(s) scheme. Plain `z.string().url()` accepts any
 * valid URL — including `javascript:` and `data:` — so a stored value can be an
 * XSS payload the moment a client renders it in an `<a href>` (see the talent
 * public profile's portfolio/github links). Every user-supplied profile URL
 * uses this instead.
 */
export const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "URL must start with http:// or https://",
  );
