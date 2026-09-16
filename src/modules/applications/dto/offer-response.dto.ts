import { z } from "zod";

export const offerResponseSchema = z.object({
  response: z.enum(["ACCEPTED", "DECLINED"]),
});

export type OfferResponseDto = z.infer<typeof offerResponseSchema>;
