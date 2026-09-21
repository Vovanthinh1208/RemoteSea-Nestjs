import { MetricsService } from "./metrics.service";

// collectDefaultMetrics() (called from the constructor) starts real
// setInterval timers with no exposed way to stop them — harmless for the one
// long-lived instance the real app creates via DI, but three real instances
// here would leak three sets of intervals that keep the test process alive
// past Jest's own run. Fake timers virtualize them instead.
describe("MetricsService", () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it("exposes recorded requests in Prometheus text format, labeled by method/route/status", async () => {
    const service = new MetricsService();

    service.recordRequest("GET", "/jobs/:id", 200, 0.042);
    service.recordRequest("GET", "/jobs/:id", 500, 1.5);

    const output = await service.metrics();

    expect(output).toContain(
      'http_requests_total{method="GET",route="/jobs/:id",status="200"} 1',
    );
    expect(output).toContain(
      'http_requests_total{method="GET",route="/jobs/:id",status="500"} 1',
    );
    expect(output).toContain("http_request_duration_seconds");
  });

  it("exposes the default process/runtime metrics alongside the custom ones", async () => {
    const service = new MetricsService();

    const output = await service.metrics();

    // collectDefaultMetrics()'s own well-known series — confirms it's
    // actually wired into this registry, not just imported.
    expect(output).toContain("process_cpu_user_seconds_total");
  });

  it("reports the same content-type prom-client's Registry produces", () => {
    const service = new MetricsService();

    expect(service.contentType).toBe(
      "text/plain; version=0.0.4; charset=utf-8",
    );
  });

  // The alertable signal behind "repeated authentication/security
  // failures" — a Prometheus rule watches this series, not a log line.
  it("counts auth failures by reason", async () => {
    const service = new MetricsService();

    service.recordAuthFailure("2fa_disable_invalid_password");
    service.recordAuthFailure("2fa_disable_invalid_password");
    service.recordAuthFailure("oauth_state_invalid");

    const output = await service.metrics();

    expect(output).toContain(
      'auth_failures_total{reason="2fa_disable_invalid_password"} 2',
    );
    expect(output).toContain(
      'auth_failures_total{reason="oauth_state_invalid"} 1',
    );
  });

  it("exposes recorded DB query durations", async () => {
    const service = new MetricsService();

    service.recordDbQuery(0.042);

    const output = await service.metrics();

    expect(output).toContain("db_query_duration_seconds");
  });
});
