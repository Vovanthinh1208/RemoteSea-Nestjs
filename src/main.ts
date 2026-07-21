import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "@/core/filters/global-exception.filter";
import { LoggingInterceptor } from "@/core/interceptors/logging.interceptor";
import { requestIdMiddleware } from "@/core/middleware/request-id.middleware";
import type { EnvConfig } from "@/core/config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.enableShutdownHooks();

  // Must run before every other middleware below: LoggingInterceptor and any
  // handler/service that wants to tag its own log lines all read req.id.
  app.use(requestIdMiddleware);

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
  // request body the Stripe webhook route needs (that's { rawBody: true } above,
  // a request-parsing concern, unrelated to response compression).
  app.use(compression());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

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
