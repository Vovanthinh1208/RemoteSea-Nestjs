import { z } from "zod";

export const resolveJobReportSchema = z
  .object({
    action: z.enum(["resolve", "dismiss"]),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((v) => !!v.reason, {
    path: ["reason"],
    message: "Decision reason is required",
  });

export type ResolveJobReportDto = z.infer<typeof resolveJobReportSchema>;
