import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().min(1, "Message can't be empty").max(4000),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;
