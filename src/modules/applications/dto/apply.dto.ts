import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";

// PB53 AC2: contact phone — digits with optional leading "+", spaces, dots,
// dashes and parentheses; 7–15 digits in total (E.164's upper bound).
export const contactPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ().-]{7,25}$/, "Invalid phone number")
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }, "Invalid phone number");

export const applySchema = z.object({
  jobId: z.string().cuid(),
  coverLetter: z.string().max(5000).optional(),
  resumeUrl: httpUrlSchema.optional(),
  contactPhone: contactPhoneSchema.optional(),
});

export type ApplyDto = z.infer<typeof applySchema>;
