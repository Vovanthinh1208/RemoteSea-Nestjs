import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
    });
  }

  async onModuleInit(): Promise<void> {
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
