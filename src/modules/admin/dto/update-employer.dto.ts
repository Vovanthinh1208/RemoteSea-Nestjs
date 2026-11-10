import { z } from "zod";

export const updateEmployerSchema = z
  .object({
    action: z.enum(["verify", "suspend"]),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((v) => v.action !== "suspend" || !!v.reason, {
    path: ["reason"],
    message: "Suspension reason is required",
  });

export type UpdateEmployerDto = z.infer<typeof updateEmployerSchema>;
