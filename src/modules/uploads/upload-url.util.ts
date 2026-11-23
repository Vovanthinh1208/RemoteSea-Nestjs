export type UploadType = "avatar" | "logo" | "cover" | "resume";

/**
 * Check the origin, directory and filename against the upload key format.
 * A string prefix alone accepts ../ and encoded traversal; fetch normalizes
 * those paths before downloading, potentially reading another user's CV.
 * This establishes URL ownership, not the existence or contents of an object.
 */
export const isOwnedUploadUrl = (
  url: string,
  cdnUrl: string | undefined,
  userId: string,
  type: UploadType,
): boolean => {
  if (!cdnUrl) return false;
  const prefix = `${cdnUrl}/uploads/${type}/${userId}/`;
  if (!url.startsWith(prefix)) return false;
  try {
    const parsed = new URL(url);
    const directory = new URL(prefix);
    if (
      parsed.origin !== directory.origin ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !parsed.pathname.startsWith(directory.pathname)
    )
      return false;
    const filename = decodeURIComponent(
      parsed.pathname.slice(directory.pathname.length),
    );
    return (
      filename !== "." &&
      filename !== ".." &&
      /^[a-zA-Z0-9._-]+$/.test(filename)
    );
  } catch {
    return false;
  }
};
