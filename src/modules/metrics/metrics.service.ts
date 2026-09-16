import { Injectable } from "@nestjs/common";
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

// One process-local registry — this app has no shared metrics store (no
// Redis, no StatsD), matching every other in-memory-only piece of
// infrastructure here (RateLimitService, the in-memory cache). A real
// multi-replica deployment scrapes each instance separately, same as
// Prometheus expects.
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests, by method/route/status",
    // route, not the raw URL — same cardinality reasoning as
    // LoggingInterceptor's own JSON access log (one series per route
    // pattern, not one per job/application id).
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });

  private readonly httpRequestDurationSeconds = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds, by method/route/status",
    labelNames: ["method", "route", "status"] as const,
    // Bucketed for typical request latencies (DB-backed reads/writes) up
    // through the slower AI-proxy/CV-analysis paths (tens of seconds) —
    // not tuned against real production percentiles yet (same caveat
    // PrismaService.SLOW_QUERY_THRESHOLD_MS already carries).
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    registers: [this.registry],
  });

  constructor() {
    // Node/process-level metrics (event loop lag, heap, GC, fd count) —
    // prom-client's own standard collector, not hand-rolled.
    collectDefaultMetrics({ register: this.registry });
  }

  recordRequest(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status: String(status) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
