import { applyDecorators } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthLiveResponseDto, HealthOkResponseDto } from "./health.dto";
import { HealthLiveExample, HealthOkExample } from "./health.examples";
import { HealthUnavailableResponse } from "./health.responses";

export const ApiHealthTag = () => applyDecorators(ApiTags("Health"));

export const ApiHealthCheck = () =>
  applyDecorators(
    ApiOperation({
      summary: "Readiness check",
      description:
        "Pings the database with `SELECT 1` and reports connectivity. No auth, no rate limit. " +
        "Point a Kubernetes readinessProbe (or equivalent) here, not a livenessProbe — a DB blip should pull " +
        "this instance out of rotation, not have an orchestrator kill and restart an otherwise-healthy process " +
        "(that's what GET /health/live is for). " +
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

export const ApiLivenessCheck = () =>
  applyDecorators(
    ApiOperation({
      summary: "Liveness check",
      description:
        "Reports only that the process is up and handling requests — no DB or other dependency check. " +
        "Point a Kubernetes livenessProbe (or equivalent) here so a slow/unreachable dependency never causes " +
        "an unnecessary restart of an otherwise-healthy instance; use GET /health for a dependency-aware readiness check.",
    }),
    ApiOkResponse({
      description: "Process is up",
      type: HealthLiveResponseDto,
      schema: { example: HealthLiveExample },
    }),
  );
