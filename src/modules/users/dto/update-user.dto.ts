import { z } from "zod";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

// PB13: 2–100 characters, and no markup — a display name has no reason to
// contain angle brackets, so an XSS payload is refused instead of stored.
export const updateUserSchema = z.object({
  name: trimmedString({ min: 2, max: 100 }).refine((v) => !/[<>]/.test(v), {
    message: "Name must not contain < or >",
  }),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
