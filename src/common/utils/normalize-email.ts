/**
 * The single normalization applied everywhere an email is written or looked up
 * (register, login, forgot-password, OAuth). Without this, "User@x.com" and
 * "user@x.com" pass the DB's case-sensitive unique constraint as two different
 * rows, and a user who registered with one case gets "Invalid email or
 * password" logging in with the other — even with the correct password.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
