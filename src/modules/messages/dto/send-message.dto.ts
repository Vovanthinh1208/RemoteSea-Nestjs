import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Message can't be empty").max(2000),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;
