import { applyDecorators } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthOkResponseDto } from "./health.dto";
import { HealthOkExample } from "./health.examples";
import { HealthUnavailableResponse } from "./health.responses";

export const ApiHealthTag = () => applyDecorators(ApiTags("Health"));

export const ApiHealthCheck = () =>
  applyDecorators(
    ApiOperation({
      summary: "Liveness check",
      description:
        "Pings the database with `SELECT 1` and reports connectivity. No auth, no rate limit. " +
        "Writes the response directly via @Res() — the one route that fully bypasses GlobalExceptionFilter and never throws, " +
        "so both the success and failure bodies below use a `{ status, ... }` shape instead of the app-wide `{ error }` convention.",
    }),
    ApiOkResponse({
      description: "Database reachable",
      type: HealthOkResponseDto,
      schema: { example: HealthOkExample },
    }),
    HealthUnavailableResponse,
  );
