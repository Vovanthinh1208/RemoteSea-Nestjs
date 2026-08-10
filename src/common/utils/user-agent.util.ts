// Lightweight, dependency-free UA parsing for Settings > Security > Active
// sessions — good enough for a friendly "Chrome on macOS" label, not meant to
// be a full device-detection library. Order matters: Edge/Chrome's UA both
// contain "Safari", so browser checks that would misfire on a broader string
// come first.
export function parseUserAgent(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";

  // iPhone/iPad checked before the generic "Mac OS X" test — iOS UAs always
  // include "like Mac OS X" as a compatibility string, which would otherwise
  // misreport every iPhone/iPad as a Mac.
  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "an unknown OS";

  return `${browser} on ${os}`;
}
