import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { RawBodyRequest } from "@nestjs/common";
import { Logger } from "@nestjs/common";
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
  app.enableShutdownHooks();

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

  app.enableCors({
    origin: config.get("FRONTEND_URL", { infer: true }),
    credentials: true,
  });
  // Strict helmet defaults (CSP included) for every route. The only page that
  // needs a looser CSP is Swagger UI, and that relaxation used to be applied
  // globally — 'unsafe-inline' script-src on the whole API to serve one docs
  // page. Now the strict policy is the default and /docs alone gets the
  // overrides below (the later path-scoped helmet re-sets the headers for
  // /docs requests, so last write wins there).
  app.use(helmet());
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

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
}

void bootstrap();
