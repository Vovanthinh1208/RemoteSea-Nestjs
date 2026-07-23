export const RATE_LIMITS = {
  CREATE: { limit: 10, windowMs: 60_000 },
  UPDATE: { limit: 20, windowMs: 60_000 },
  // Public, unauthenticated, and the only public route with a genuinely
  // expensive query path (the `q` trigram search + facets aggregation) —
  // generous enough for real browsing/pagination, low enough to blunt a
  // scripted scrape or search-flooding hitting the origin directly (a CDN
  // hit never reaches this check at all, see the route's Cache-Control).
  LIST: { limit: 60, windowMs: 60_000 },
} as const;
