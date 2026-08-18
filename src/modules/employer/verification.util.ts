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
