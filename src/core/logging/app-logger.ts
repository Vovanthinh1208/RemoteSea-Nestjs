import { ConsoleLogger } from "@nestjs/common";
import { requestContext } from "./request-context";

const withRequestId = (message: unknown): unknown => {
  if (typeof message !== "string") return message;
  const requestId = requestContext.getRequestId();
  return requestId ? `[${requestId}] ${message}` : message;
};

/**
 * Registered once via app.useLogger(new AppLogger()) in main.ts. NestJS's
 * Logger class shares one static instance app-wide (Logger.overrideLogger,
 * which useLogger calls under the hood) — every existing `new Logger(X.name)`
 * across the app delegates to whatever instance is registered here, so this
 * is the only place that needs to change to give every log line access to
 * the current request id, not just the handful of call sites that happen to
 * have a Request object in scope.
 */
export class AppLogger extends ConsoleLogger {
  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(withRequestId(message), ...optionalParams);
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(withRequestId(message), ...optionalParams);
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(withRequestId(message), ...optionalParams);
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(withRequestId(message), ...optionalParams);
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(withRequestId(message), ...optionalParams);
  }
}
