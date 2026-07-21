import { z } from "zod";

export const paginationQuerySchema = z.object({
  // Capped, not just floored: paginationSkip() turns this straight into
  // Postgres's OFFSET, so an unbounded page number lets a request force an
  // arbitrarily expensive scan-and-discard — cheap to send, costly to serve.
  // No legitimate UI ever pages this deep; the cap only affects abuse.
  page: z.coerce.number().min(1).max(100_000).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});
