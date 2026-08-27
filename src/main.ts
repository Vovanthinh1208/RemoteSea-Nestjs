import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { RawBodyRequest } from "@nestjs/common";
import { Logger, VERSION_NEUTRAL, VersioningType } from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";
import express from "express";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "@/core/filters/global-exception.filter";
import { LoggingInterceptor } from "@/core/interceptors/logging.interceptor";
import { RateLimitHeadersInterceptor } from "@/core/interceptors/rate-limit-headers.interceptor";
import { requestIdMiddleware } from "@/core/middleware/request-id.middleware";
import { AppLogger } from "@/core/logging/app-logger";
import type { EnvConfig } from "@/core/config/env.validation";

// Node 15+ already terminates the process on an unhandled rejection by
// default — but *only* when nothing is listening for the event. Registering
// a handler at all suppresses that default, so this one must explicitly
// exit itself to keep the exact same fail-fast behavior; the only change is
// that the reason gets logged first instead of just a bare stderr dump.
// Without this, a bug that produces a genuinely unhandled rejection anywhere
// in the app leaves no structured trace of what actually happened.
const bootstrapLogger = new Logger("Process");
process.on("unhandledRejection", (reason) => {
  bootstrapLogger.error(
    "Unhandled promise rejection — exiting",
    reason instanceof Error ? reason.stack : reason,
  );
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  bootstrapLogger.error("Uncaught exception — exiting", error.stack);
  process.exit(1);
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Shared by every `new Logger(X.name)` call site app-wide (Nest's Logger
  // class delegates to whatever instance is registered here) — see
  // app-logger.ts for why this is the one place that needs to change to
  // give every log line request-id correlation.
  app.useLogger(new AppLogger());
  app.enableShutdownHooks();

  // Infrastructure only — changes nothing about any route today. Every
  // existing controller has no @Version() decorator, so each one resolves to
  // VERSION_NEUTRAL and keeps its exact current path (confirmed by reading
  // @nestjs/core's route-path-factory.js: VERSION_NEUTRAL is explicitly
  // excluded from the URL). This just makes `@Version("2")` on some future
  // route (served at /v2/...) possible without a project-wide migration —
  // there was no way to introduce a breaking change to one endpoint without
  // breaking every existing caller of it before this.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });

  // Must run before every other middleware below: LoggingInterceptor and any
  // handler/service that wants to tag its own log lines all read req.id.
  app.use(requestIdMiddleware);

  // Only POST /billing/webhook needs the raw request bytes (Stripe's signature
  // check requires the exact original body). This used to be `rawBody: true`
  // on NestFactory.create, which attaches req.rawBody on every request app-wide
  // — every job/application/profile mutation carried an extra Buffer copy of
  // its own body for a field only this one route ever reads. Registered here,
  // before Nest's own global body-parser is set up inside app.listen() below,
  // so it claims this path's body first (body-parser's req._body marker then
  // makes Nest's json() parser skip it for this route, unaffected everywhere
  // else). verify mirrors Nest's own rawBody option exactly, so
  // billing.controller.ts's req.rawBody read needs no change.
  app.use(
    "/billing/webhook",
    express.raw({
      type: "application/json",
      verify: (req: RawBodyRequest<Request>, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const config = app.get(ConfigService<EnvConfig, true>);

  // Must match the real number of reverse-proxy hops in front of this app (see
  // env.validation.ts) — the per-IP rate limiter (rate-limit.service.ts) relies on
  // req.ip being the actual client IP, which Express only derives correctly from
  // X-Forwarded-For once trust proxy is set to the right hop count.
  app.set("trust proxy", config.get("TRUST_PROXY_HOPS", { infer: true }));

  // Array, not a single string — ADDITIONAL_CORS_ORIGINS (see its own
  // comment in env.validation.ts) lets a second frontend deployment (a
  // parallel host migration, a preview environment) call this API without
  // becoming the OAuth/email/billing redirect target that FRONTEND_URL
  // alone still is. Unset ADDITIONAL_CORS_ORIGINS = this array has exactly
  // one entry, functionally identical to the previous single-origin config.
  const additionalCorsOrigins = (
    config.get("ADDITIONAL_CORS_ORIGINS", { infer: true }) ?? ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: [
      config.get("FRONTEND_URL", { infer: true }),
      ...additionalCorsOrigins,
    ],
    credentials: true,
  });
  // Strict helmet defaults (CSP included) for every route. The only page that
  // needs a looser CSP is Swagger UI, and that relaxation used to be applied
  // globally — 'unsafe-inline' script-src on the whole API to serve one docs
  // page. Now the strict policy is the default and /docs alone gets the
  // overrides below (the later path-scoped helmet re-sets the headers for
  // /docs requests, so last write wins there).
  app.use(helmet());

  // Swagger's full schema (every endpoint, DTO, response shape) is a
  // deliberate information-disclosure surface — fine for local/CI use, not
  // for a deployed instance a stranger can browse to map the whole API.
  // Skipped entirely in production, not just left unlinked: an unlisted
  // route is still a reachable route.
  const isProduction = config.get("NODE_ENV", { infer: true }) === "production";
  if (!isProduction) {
    app.use(
      "/docs",
      helmet({
        // Swagger UI ships an inline bootstrap script and inline styles, and
        // pings validator.swagger.io for its "valid spec" badge — the default
        // CSP blocks all three. Relaxing just these directives (rather than
        // disabling CSP outright) keeps helmet's other protections intact
        // (frameguard, HSTS, nosniff, etc.) even on /docs.
        contentSecurityPolicy: {
          directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "https://validator.swagger.io"],
          },
        },
      }),
    );
  }
  // gzips response bodies over ~1KB (compression's default threshold) — the admin
  // job list and job-detail responses carry full description/requirements text on
  // every row and were previously going out uncompressed. Applied before the
  // Swagger setup below is fine — it only affects response bodies, not the raw
  // request body the Stripe webhook route needs (that's the scoped express.raw()
  // above, a request-parsing concern, unrelated to response compression).
  app.use(compression());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new RateLimitHeadersInterceptor(),
  );

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("RemoteSEA API")
      .setDescription(
        "REST API for RemoteSEA, a remote job platform for Southeast Asia. See docs/API.md in the repo for the full hand-written reference.",
      )
      .setVersion("1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "bearer",
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = config.get("PORT", { infer: true });
  // Explicit host: Nest's app.listen(port) without one lets Node pick its own
  // default bind address, which is unreliable across container base images —
  // Fly.io's proxy reaches the app over its private network interface, not
  // loopback, so this must bind every interface, not just localhost.
  const server = await app.listen(port, "0.0.0.0");

  // Node's http.Server defaults (keepAliveTimeout: 5s, headersTimeout: 60s)
  // assume nothing sits in front of it. This app always runs behind a reverse
  // proxy/load balancer (see TRUST_PROXY_HOPS above) — virtually every one of
  // those (nginx, Railway, Render, Fly, ALB) keeps its own client connections
  // alive well past 5s. If the proxy reuses a keep-alive connection to send a
  // new request at the exact moment Node's 5s timer has just closed that
  // socket, the request hits a connection that's already gone — surfacing to
  // end users as an intermittent 502, not a clean error from this app. Raising
  // both past any realistic upstream idle timeout closes that race; headers
  // must stay greater than keepAlive (Node enforces this at the socket level).
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Raising keepAliveTimeout above has a side effect on shutdown: Nest's
  // enableShutdownHooks (above) closes this same server via a bare
  // httpServer.close(resolve) on SIGTERM, which waits for every socket to
  // end on its own — including idle keep-alive ones, which now only time
  // out after up to 65s instead of 5s. That risks missing the orchestrator's
  // SIGTERM->SIGKILL grace window (commonly 10-30s) before onModuleDestroy
  // (Prisma disconnect, ViewCountBuffer's final flush) ever runs. Force-
  // closing idle sockets — not all sockets — the moment shutdown starts
  // keeps genuinely in-flight requests draining normally while removing the
  // part of the wait this app just made 13x longer.
  process.on("SIGTERM", () => server.closeIdleConnections());
  process.on("SIGINT", () => server.closeIdleConnections());
}

void bootstrap();
