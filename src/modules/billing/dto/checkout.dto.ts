import { z } from "zod";

export const checkoutSchema = z.object({
  jobId: z.string().cuid(),
});

export type CheckoutDto = z.infer<typeof checkoutSchema>;
