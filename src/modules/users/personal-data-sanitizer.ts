/**
 * Defense-in-depth sanitizer for personal data exports (PB17 - AC06).
 *
 * Even though the database query uses an explicit allowlist (select),
 * this sanitizer performs a strict recursive pass across all nested objects
 * and arrays to guarantee zero credential, token, or cryptographic secret leakage.
 */

const FORBIDDEN_KEY_PATTERNS = [
  /^password/i,
  /password$/i,
  /hash/i,
  /secret/i,
  /^token$/i,
  /token$/i,
  /twofactor/i,
  /otp/i,
  /recovery/i,
  /privatekey/i,
  /apikey/i,
  /sessiontoken/i,
  /sessionsecret/i,
  /sessionsig/i,
  /credential/i,
];

export function isForbiddenKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "");
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function sanitizePersonalData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizePersonalData(item)) as unknown as T;
  }

  if (typeof input === "object" && !(input instanceof Date)) {
    const sanitized: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(input)) {
      if (isForbiddenKey(key)) {
        // Drop the sensitive property completely
        continue;
      }
      sanitized[key] = sanitizePersonalData(value);
    }
    return sanitized as T;
  }

  return input;
}
