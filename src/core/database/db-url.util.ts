/**
 * Appends Prisma's pool-sizing query params to the datasource URL.
 *
 * Prisma only reads pool configuration from the connection URL
 * (connection_limit / pool_timeout) — there is no client-option equivalent —
 * so the explicit env knobs (DATABASE_CONNECTION_LIMIT / DATABASE_POOL_TIMEOUT,
 * see env.validation.ts) are merged into the URL here. An env knob wins over a
 * param already present in DATABASE_URL; params not covered by a knob pass
 * through untouched. With neither knob set the URL is returned as-is, byte for
 * byte, so existing deployments keep Prisma's default behavior exactly.
 */
export const withPoolParams = (
  databaseUrl: string,
  connectionLimit?: number,
  poolTimeoutSeconds?: number,
): string => {
  if (connectionLimit === undefined && poolTimeoutSeconds === undefined) {
    return databaseUrl;
  }

  const url = new URL(databaseUrl);

  if (connectionLimit !== undefined) {
    url.searchParams.set("connection_limit", String(connectionLimit));
  }

  if (poolTimeoutSeconds !== undefined) {
    url.searchParams.set("pool_timeout", String(poolTimeoutSeconds));
  }

  return url.toString();
};
