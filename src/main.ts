import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "@/core/filters/global-exception.filter";
import type { EnvConfig } from "@/core/config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();

  const config = app.get(ConfigService<EnvConfig, true>);

  app.enableCors({
    origin: config.get("FRONTEND_URL", { infer: true }),
    credentials: true,
  });
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("RemoteSEA API")
    .setDescription(
      "REST API for RemoteSEA, a remote job platform for Southeast Asia. See docs/API.md in the repo for the full hand-written reference."
    )
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
}

void bootstrap();
