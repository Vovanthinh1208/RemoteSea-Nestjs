import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "@/core/filters/global-exception.filter";
import type { EnvConfig } from "@/core/config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const config = app.get(ConfigService<EnvConfig, true>);

  app.enableCors({
    origin: config.get("FRONTEND_URL", { infer: true }),
    credentials: true,
  });
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
}

void bootstrap();
