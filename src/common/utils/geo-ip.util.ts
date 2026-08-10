import geoip from "geoip-lite";

// ISO 3166-1 alpha-2 -> display name ("VN" -> "Vietnam") — geoip-lite only
// ever returns the code. Intl.DisplayNames is built into Node, so this needs
// no extra dependency or static country-name table.
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

const countryDisplayName = (code: string): string => {
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
};

// Settings > Security > Active sessions "location" column. geoip-lite is an
// offline MaxMind GeoLite2 lookup (bundled data file, no network call, no API
// key, no rate limit) — city/region are frequently empty for a given IP
// (privacy-obscured ranges like public DNS resolvers, or just coarser free-tier
// data), so this degrades gracefully to whatever precision is actually available
// down to just the country, and returns null (not "Unknown") for anything
// unresolvable — loopback/private ranges (::1, 127.0.0.1, 192.168.x, 10.x) always
// resolve to null, which is the common case in local development.
export function lookupIpLocation(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const result = geoip.lookup(ip);
  if (!result) return null;

  const parts = [
    result.city,
    result.region,
    countryDisplayName(result.country),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
