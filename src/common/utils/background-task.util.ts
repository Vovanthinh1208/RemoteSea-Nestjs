import type { Logger } from "@nestjs/common";

/**
 * Fire-and-forget for side-effect I/O whose failure must never fail the
 * request (notification emails, cleanup calls). The caller's response stops
 * waiting on the outbound round-trip; failures are logged with the same
 * message the old inline try/catch blocks used. Only use this where the
 * result genuinely doesn't matter to the response — anything the caller
 * reads or reports on must stay awaited.
 */
export const runInBackground = (
  task: Promise<unknown>,
  logger: Logger,
  failureMessage: string,
): void => {
  void task.catch((error: unknown) => {
    logger.error(failureMessage, error instanceof Error ? error.stack : error);
  });
};
