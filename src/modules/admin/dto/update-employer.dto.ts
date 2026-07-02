import { z } from "zod";

export const updateEmployerSchema = z.object({
  action: z.enum(["verify", "suspend"]),
});

export type UpdateEmployerDto = z.infer<typeof updateEmployerSchema>;
