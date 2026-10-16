import { z } from "zod";

// PB20: re-enter the current password and type DELETE. Accounts that signed up
// through OAuth have no password, so for them only the confirmation applies.
export const deleteAccountSchema = z.object({
  password: z.string().max(200).optional(),
  confirmation: z.literal("DELETE"),
});

export type DeleteAccountDto = z.infer<typeof deleteAccountSchema>;
