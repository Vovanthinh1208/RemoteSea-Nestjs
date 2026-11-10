import { z } from "zod";

export const checkoutSchema = z.object({
  jobId: z.string().cuid(),
  planType: z.enum(["STANDARD", "FEATURED", "HANDS_ON"]).optional(),
});

export type CheckoutDto = z.infer<typeof checkoutSchema>;
