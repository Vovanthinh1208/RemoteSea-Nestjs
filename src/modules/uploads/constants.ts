export const S3_CLIENT = "S3_CLIENT";

export const CONTENT_TYPES = {
  avatar: ["image/jpeg", "image/png", "image/webp"],
  logo: ["image/jpeg", "image/png", "image/webp"],
  resume: ["application/pdf"],
} as const;

export function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
