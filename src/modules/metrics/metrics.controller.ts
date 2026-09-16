import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { MetricsService } from "./metrics.service";
import { MetricsSecretGuard } from "./guards/metrics-secret.guard";

// Excluded from Swagger — an ops-only scrape target, not part of the public
// API surface (same reasoning as /docs itself being skipped in production).
@ApiExcludeController()
@Controller("metrics")
@UseGuards(MetricsSecretGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  // Content-Type is prom-client's own Registry.contentType — stable across
  // the library's Prometheus text-exposition-format version (verified
  // against the installed 15.x), hardcoded here rather than read at request
  // time since @Header only accepts a static string.
  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  getMetrics(): Promise<string> {
    return this.metricsService.metrics();
  }
}
