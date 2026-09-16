import { Global, Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

// Global so LoggingInterceptor (registered app-wide in main.ts, outside any
// module's own DI scope) can still record into the same MetricsService
// instance every request hits.
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
