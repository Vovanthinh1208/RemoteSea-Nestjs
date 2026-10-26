import { createHash } from "crypto";

// Compares the submitted verification email's domain against the company
// website's hostname — case-insensitive, ignoring a leading "www." on either
// side (so jane@acme.com matches both https://acme.com and https://www.acme.com).
export function domainMatches(websiteUrl: string, email: string): boolean {
  const emailDomain = email.split("@")[1]?.toLowerCase();
  if (!emailDomain) return false;

  let hostname: string;
  try {
    hostname = new URL(websiteUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  const normalize = (host: string) => host.replace(/^www\./, "");
  return normalize(emailDomain) === normalize(hostname);
}

// PB32: the stored form of an emailed OTP — "otp:" + a hash scoped to the
// company, so two companies drawing the same code never collide on the
// unique token column, and the legacy link route can tell an OTP row apart
// (it must never confirm one).
export const OTP_TOKEN_PREFIX = "otp:";

export function hashVerificationCode(employerId: string, code: string): string {
  return (
    OTP_TOKEN_PREFIX +
    createHash("sha256").update(`${employerId}:${code}`).digest("hex")
  );
}
