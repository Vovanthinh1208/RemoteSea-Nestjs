import { z } from "zod";

// Deliberately loose beyond "question is required" — remotesea-ai's own
// Pydantic ChatRequest is the real source of truth for this shape (see
// ai-orchestrator.controller.ts's comment); this only guards the one thing
// worth failing fast on locally rather than paying a round trip for.
export const chatRequestSchema = z.object({
  question: z.string().trim().min(1),
  applicationId: z.string().optional(),
  conversationId: z.string().optional(),
});

export type ChatRequestDto = z.infer<typeof chatRequestSchema>;
