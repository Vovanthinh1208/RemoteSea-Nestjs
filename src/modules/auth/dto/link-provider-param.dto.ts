import { z } from "zod";

export const linkProviderParamSchema = z.enum(["google", "github", "linkedin"]);
export type LinkProviderParamDto = z.infer<typeof linkProviderParamSchema>;
