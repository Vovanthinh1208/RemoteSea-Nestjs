import { parentPort, workerData } from "node:worker_threads";
import { PersonalDataPdfRenderer } from "./personal-data-pdf-renderer";
import { ExportTooLargeError } from "./personal-data-contract";

if (parentPort) {
  void PersonalDataPdfRenderer.render(
    workerData.payload,
    workerData.locale,
  ).then(
    (buffer) => parentPort!.postMessage({ buffer }),
    (error: unknown) =>
      parentPort!.postMessage({
        error:
          error instanceof ExportTooLargeError ? "TOO_LARGE" : "RENDER_FAILED",
      }),
  );
}
