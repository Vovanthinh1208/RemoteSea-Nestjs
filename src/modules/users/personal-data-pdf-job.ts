import { Worker } from "node:worker_threads";
import {
  ExportRenderError,
  ExportTooLargeError,
  type ExportLocale,
  type PersonalDataExportPayload,
} from "./personal-data-contract";

/** No PII or files are persisted. The worker can be terminated even when a
 * pathological font/layout calculation would otherwise block the API loop. */
export function renderPersonalDataPdf(
  payload: PersonalDataExportPayload,
  locale: ExportLocale,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const filename = require.resolve("./personal-data-pdf-worker");
    const worker = new Worker(filename, {
      workerData: { payload, locale },
      execArgv: filename.endsWith(".ts")
        ? ["-r", require.resolve("ts-node/register/transpile-only")]
        : [],
      resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    });
    let settled = false;
    const finish = (error?: Error, buffer?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(buffer!);
    };
    const timer = setTimeout(
      () => finish(new ExportRenderError("PDF rendering timed out")),
      20_000,
    );
    worker.once(
      "message",
      (message: { buffer?: Uint8Array; error?: string }) => {
        if (message.error)
          finish(
            message.error === "TOO_LARGE"
              ? new ExportTooLargeError(
                  "PDF is too large; request JSON instead",
                )
              : new ExportRenderError("PDF rendering failed"),
          );
        else if (message.buffer) {
          const buffer = Buffer.from(message.buffer);
          if (buffer.subarray(0, 5).toString() !== "%PDF-")
            finish(new ExportRenderError("Invalid PDF output"));
          else finish(undefined, buffer);
        } else finish(new ExportRenderError("Invalid PDF worker response"));
      },
    );
    worker.once("error", () =>
      finish(new ExportRenderError("PDF rendering failed")),
    );
    worker.once("exit", () => {
      if (!settled)
        finish(new ExportRenderError("PDF worker exited without a document"));
    });
  });
}
