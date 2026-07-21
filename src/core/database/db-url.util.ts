/**
 * Appends Prisma's pool-sizing (and statement-timeout) query params to the
 * datasource URL.
 *
 * Prisma only reads this configuration from the connection URL
 * (connection_limit / pool_timeout / statement_timeout) — there is no
 * client-option equivalent — so the explicit env knobs (DATABASE_CONNECTION_LIMIT
 * / DATABASE_POOL_TIMEOUT / DATABASE_STATEMENT_TIMEOUT, see env.validation.ts)
 * are merged into the URL here. An env knob wins over a param already present
 * in DATABASE_URL; params not covered by a knob pass through untouched. With
 * no knob set the URL is returned as-is, byte for byte, so existing
 * deployments keep Prisma's default behavior exactly.
 *
 * statement_timeout in particular matters under load: without it, a
 * lock-contended or runaway query holds its pool connection indefinitely, and
 * every other request then queues behind it just to *acquire* a connection —
 * the classic pool-exhaustion cascade. A timeout turns that into a bounded
 * failure (that one query errors out) instead of an unbounded one (the whole
 * pool backs up).
 */
export const withPoolParams = (
  databaseUrl: string,
  connectionLimit?: number,
  poolTimeoutSeconds?: number,
  statementTimeoutSeconds?: number,
): string => {
  if (
    connectionLimit === undefined &&
    poolTimeoutSeconds === undefined &&
    statementTimeoutSeconds === undefined
  ) {
    return databaseUrl;
  }

  const url = new URL(databaseUrl);

  if (connectionLimit !== undefined) {
    url.searchParams.set("connection_limit", String(connectionLimit));
  }

  if (poolTimeoutSeconds !== undefined) {
    url.searchParams.set("pool_timeout", String(poolTimeoutSeconds));
  }

  if (statementTimeoutSeconds !== undefined) {
    url.searchParams.set("statement_timeout", String(statementTimeoutSeconds));
  }

  return url.toString();
};
