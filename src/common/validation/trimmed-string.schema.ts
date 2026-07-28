import { z } from "zod";

/**
 * A plain `z.string().min(N)` lets a value that's entirely whitespace padding
 * through as long as it's N characters long — e.g. a 5-character job title of
 * "     " passes `.min(5)`, then gets stored and displayed as blank. Trimming
 * must come *before* the length checks, not after: ZodString runs its checks
 * in declaration order, so `.min(N).trim()` would validate length on the
 * untrimmed value while still returning the trimmed (now possibly shorter)
 * one — `.trim()` first is the only order that actually closes the gap.
 *
 * Used for the free-text fields users actually read (job titles, company
 * names, headlines) — not applied blanket to every string field in the app
 * (enum-like values, URLs, ids etc. don't benefit from trimming the same way).
 */
export const trimmedString = ({
  min,
  max,
}: {
  min?: number;
  max: number;
}): z.ZodString => {
  const schema = z.string().trim().max(max);
  return min === undefined ? schema : schema.min(min);
};
