import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
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
    } catch {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: "error",
        db: "disconnected",
      });
    }
  }
}
