import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "@/core/database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
