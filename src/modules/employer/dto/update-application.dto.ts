import { z } from "zod";
import { applicationStatusSchema } from "@/common/dto/enums.schema";

export const APPLICATION_REASON_MAX_LENGTH = 1000;

// PB58 BR2: optional feedback shown to the talent when rejecting. Unlike
// `notes` (the company's private note), this one is sent to the applicant.
export const rejectionReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(APPLICATION_REASON_MAX_LENGTH);

// PB56 AC2: what the talent sees in the offer block — salary, benefits and
// the proposed start date (a calendar date, not a timestamp).
export const offerDetailsSchema = z.object({
  salary: z.string().trim().min(1).max(120),
  benefits: z.string().trim().min(1).max(2000),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
      message: "Invalid date",
    }),
});

export type OfferDetailsDto = z.infer<typeof offerDetailsSchema>;

export const updateApplicationSchema = z.object({
  status: applicationStatusSchema,
  notes: z.string().max(2000).optional(),
  reason: rejectionReasonSchema.optional(),
  offer: offerDetailsSchema.optional(),
});

export type UpdateApplicationDto = z.infer<typeof updateApplicationSchema>;
