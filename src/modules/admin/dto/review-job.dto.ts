import { z } from "zod";

export const reviewJobSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.action !== "reject" || !!v.note, {
    path: ["note"],
    message: "Rejection reason is required",
  });

export type ReviewJobDto = z.infer<typeof reviewJobSchema>;
