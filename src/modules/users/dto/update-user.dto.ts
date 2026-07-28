import { z } from "zod";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

export const updateUserSchema = z.object({
  name: trimmedString({ min: 1, max: 120 }),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
