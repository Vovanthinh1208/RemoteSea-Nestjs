export type UploadType = "avatar" | "logo" | "cover" | "resume";

/**
 * True only if `url` is exactly a presigned-upload result this user could have
 * legitimately obtained from POST /uploads/presign — i.e. it starts with
 * `${cdnUrl}/uploads/{type}/{userId}/`. Without this check, any authenticated
 * user could PATCH an arbitrary third-party URL into logoUrl/resumeUrl and
 * bypass the presign flow's content-type allowlist, size cap, and rate limit
 * entirely, since those endpoints never go through it.
 */
export const isOwnedUploadUrl = (
  url: string,
  cdnUrl: string | undefined,
  userId: string,
  type: UploadType,
): boolean => {
  if (!cdnUrl) return false;
  const prefix = `${cdnUrl}/uploads/${type}/${userId}/`;
  return url.startsWith(prefix);
};
