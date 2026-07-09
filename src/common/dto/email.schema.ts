import { z } from "zod";

/** Normalizes before validating, so "  User@X.com " and "user@x.com" are the
 *  same value by the time it reaches the repository/DB layer. Mirrors the
 *  plain-function version in @/common/utils/normalize-email, used where a
 *  zod schema isn't available (e.g. the OAuth strategies). */
export const emailSchema = z.string().trim().toLowerCase().email();
