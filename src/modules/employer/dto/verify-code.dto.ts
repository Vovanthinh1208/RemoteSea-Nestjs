import { z } from "zod";
import { VERIFICATION_OTP_LENGTH } from "../constants";

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{${VERIFICATION_OTP_LENGTH}}$`),
      "Enter the 6-digit code",
    ),
});

export type VerifyCodeDto = z.infer<typeof verifyCodeSchema>;
