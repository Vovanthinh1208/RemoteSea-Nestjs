import { z } from "zod";

// Settings > Notifications. The email preferences gate application updates,
// employer messages, weekly digests, and instant match alerts. Product news,
// tips/resources, and browser push are persisted for their future send paths.
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
