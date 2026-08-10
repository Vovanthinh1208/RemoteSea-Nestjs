import { z } from "zod";

// Settings > Account. All optional/partial — the UI saves this section as a
// whole, but the schema doesn't require every field on every call. Language/
// region/currency are closed enums matching the <select> options in the
// remotesea design reference (remotesea-web's Settings > Account section),
// not because the backend enforces those choices for any other reason.
export const updateAccountSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .max(30)
      // Empty string clears the field — treated as "no phone", not stored as "".
      .transform((v) => (v.length === 0 ? null : v))
      .nullable()
      .optional(),
    language: z.enum(["English", "Tiếng Việt"]).optional(),
    region: z.enum(["Vietnam", "Singapore", "Australia"]).optional(),
    currencyDisplay: z.enum(["USD ($)", "VND (₫)", "SGD (S$)"]).optional(),
    // Profile setup "The basics" avatar. null clears it back to initials-only.
    // Must be an uploaded file from this account — enforced in
    // UsersService.updateAccount, same as TalentService.upsertProfile's
    // resumeUrl check (this schema only validates shape, not ownership).
    image: z.string().url().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;
