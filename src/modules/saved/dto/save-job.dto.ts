import { z } from "zod";

export const saveSchema = z.object({ jobId: z.string().cuid() });

export type SaveJobDto = z.infer<typeof saveSchema>;
