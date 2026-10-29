import { z } from "zod";

export const OFFER_DECLINE_REASON_MAX_LENGTH = 1000;

// PB56 AC4: declining requires a reason; accepting takes none.
export const offerResponseSchema = z.discriminatedUnion("response", [
  z.object({ response: z.literal("ACCEPTED") }),
  z.object({
    response: z.literal("DECLINED"),
    reason: z.string().trim().min(1).max(OFFER_DECLINE_REASON_MAX_LENGTH),
  }),
]);

export type OfferResponseDto = z.infer<typeof offerResponseSchema>;
