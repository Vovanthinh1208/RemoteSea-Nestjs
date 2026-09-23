import { z } from "zod";

export const oauthExchangeSchema = z.object({
  code: z.string().min(1),
});
export type OAuthExchangeDto = z.infer<typeof oauthExchangeSchema>;
