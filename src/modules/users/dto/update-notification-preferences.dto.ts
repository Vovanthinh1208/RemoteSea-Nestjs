import { z } from "zod";

// Settings > Notifications. Nothing in this codebase sends a notification
// gated by these yet (no email/push dispatch reads this row) — this is a
// real, persisted preference with no reader, same caveat as update-account.dto.ts.
export const updateNotificationPreferencesSchema = z
  .object({
    applicationUpdates: z.boolean().optional(),
    employerMessages: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    instantMatchAlerts: z.boolean().optional(),
    productNews: z.boolean().optional(),
    tipsAndResources: z.boolean().optional(),
    browserPush: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateNotificationPreferencesDto = z.infer<
  typeof updateNotificationPreferencesSchema
>;
