import { z } from "zod";

export const resolveJobReportSchema = z.object({
  action: z.enum(["resolve", "dismiss"]),
});

export type ResolveJobReportDto = z.infer<typeof resolveJobReportSchema>;
