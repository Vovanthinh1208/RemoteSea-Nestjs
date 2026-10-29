import { z } from "zod";

// PB70 AC2: GET /reviews/eligibility?partnerId=<the other party's user id>.
export const reviewEligibilityQuerySchema = z.object({
  partnerId: z.string().min(1).max(64),
});

export type ReviewEligibilityQueryDto = z.infer<
  typeof reviewEligibilityQuerySchema
>;
