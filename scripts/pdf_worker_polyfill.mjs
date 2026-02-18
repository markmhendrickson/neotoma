/**
 * Worker entry that polyfills DOMMatrix/ImageData/Path2D from @napi-rs/canvas
 * then loads the real pdfjs worker. Required in Node when the PDF renderer
 * runs in a worker thread (DOMMatrix is not defined there otherwise).
 */
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;

let port = null;
try {
  const { parentPort } = await import("worker_threads");
  port = parentPort;
} catch {
  // Not Node worker_threads (e.g. browser worker)
}

const { createRequire } = await import("module");
const require = createRequire(import.meta.url);
const realWorkerPath = require.resolve("pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs");
const real = await import(realWorkerPath);
if (port && real.WorkerMessageHandler) {
  real.WorkerMessageHandler.initializeFromPort(port);
}
// So the main-thread fake worker path (import(this wrapper)) gets WorkerMessageHandler
export const WorkerMessageHandler = real.WorkerMessageHandler;
