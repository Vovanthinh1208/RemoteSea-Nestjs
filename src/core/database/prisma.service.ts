import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";
import type { EnvConfig } from "@/core/config/env.validation";
import { withPoolParams } from "./db-url.util";

// Below this, a query is unremarkable and only surfaces in dev's debug log; at
// or above it, it's logged as a warning in every environment, including
// production — this is the only per-query timing signal the app has, since
// there's no APM/tracing wired up. Picked as "clearly not a fast indexed
// lookup" rather than tuned against real production percentiles (none
// recorded yet); revisit once this has run against real traffic.
export const SLOW_QUERY_THRESHOLD_MS = 200;

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, "query" | "error" | "warn">
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      datasources: {
        db: {
          url: withPoolParams(
            config.get("DATABASE_URL", { infer: true }),
            config.get("DATABASE_CONNECTION_LIMIT", { infer: true }),
            config.get("DATABASE_POOL_TIMEOUT", { infer: true }),
          ),
        },
      },
      // Event (not stdout) emission for all three: lets every query's duration
      // be inspected here instead of only ever seeing Prisma's own formatting,
      // and routes error/warn through the same Nest Logger as the rest of the
      // app instead of a separate unstructured stdout stream.
      log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "error" },
        { emit: "event", level: "warn" },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // event/query params can contain user input (emails, tokens); only the SQL
    // text + duration are logged, never event.params.
    this.$on("query", (event) => {
      if (event.duration >= SLOW_QUERY_THRESHOLD_MS) {
        this.logger.warn(`Slow query (${event.duration}ms): ${event.query}`);
      } else if (process.env.NODE_ENV === "development") {
        this.logger.debug(`${event.query} (${event.duration}ms)`);
      }
    });
    this.$on("error", (event) => this.logger.error(event.message));
    this.$on("warn", (event) => this.logger.warn(event.message));

    const maxAttempts = 5;
    const delayMs = 2_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        if (attempt > 1) {
          this.logger.log(`Connected to database after ${attempt} attempts.`);
        }
        return;
      } catch (error) {
        const isFinalAttempt = attempt === maxAttempts;
        const reason =
          error instanceof Error
            ? error.message
            : "Unknown database connection error";

        if (isFinalAttempt) {
          this.logger.error(
            `Failed to connect to database after ${maxAttempts} attempts. The app will continue starting, but database-backed endpoints may fail until the connection is available. ${reason}`,
          );
          return;
        }

        this.logger.warn(
          `Database connection attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
