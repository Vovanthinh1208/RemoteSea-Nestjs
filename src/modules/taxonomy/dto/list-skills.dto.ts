import { z } from "zod";

export const listSkillsSchema = z.object({
  q: z.string().trim().optional(),
});

export type ListSkillsDto = z.infer<typeof listSkillsSchema>;
