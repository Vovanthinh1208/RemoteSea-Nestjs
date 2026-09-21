import * as crypto from "crypto";

/**
 * Constant-time string comparison for secret/token checks — a plain `===`
 * short-circuits at the first differing byte, which is enough of a timing
 * side-channel to let a network attacker recover a bearer secret
 * character-by-character over many requests. Used anywhere this app
 * compares a caller-supplied value against a server-held secret (OAuth
 * state cookie, CRON_SECRET, METRICS_SECRET) — never for two values where
 * neither side is secret.
 *
 * The length check before crypto.timingSafeEqual (which throws on
 * mismatched-length buffers) does itself leak length through timing, but
 * that's the standard, accepted tradeoff for this kind of check — the
 * secret's length isn't the part worth protecting, its content is.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}
