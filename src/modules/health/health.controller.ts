import { Controller, Get, HttpStatus, Logger, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "@/core/database/prisma.service";
import {
  ApiHealthCheck,
  ApiHealthTag,
  ApiLivenessCheck,
} from "./docs/health.swagger";

@ApiHealthTag()
@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  // No DB dependency on purpose — see ApiLivenessCheck.
  @ApiLivenessCheck()
  @Get("live")
  live(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({ status: "ok" });
  }

  @ApiHealthCheck()
  @Get()
  async check(@Res() res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return res.status(HttpStatus.OK).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        db: "connected",
      });
    } catch (error) {
      // Otherwise a failing readiness probe gives no clue why (timeout vs
      // connection refused vs auth failure) — this is the one signal an
      // operator has when this route starts returning 503.
      this.logger.error(
        "Readiness check failed: SELECT 1 did not succeed",
        error instanceof Error ? error.stack : error,
      );
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: "error",
        db: "disconnected",
      });
    }
  }
}
