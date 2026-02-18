/**
 * Extract plain text from file buffers (PDF, text, etc.) for interpretation.
 * Shared by MCP store and REST store/unstructured.
 */

import { logger } from "../utils/logger.js";

let pdfGlobalsPolyfilled = false;
let pdfWorkerDebug: {
  wrapper_path_tried: string | null;
  configured: boolean;
  set_worker_error?: string;
} = { wrapper_path_tried: null, configured: false };

/** True if the PDF canvas globals (DOMMatrix etc.) were polyfilled this process. */
export function isPdfWorkerWrapperConfigured(): boolean {
  return pdfGlobalsPolyfilled;
}

/** Debug info for store response (polyfill method tried, configured, any error). */
export function getPdfWorkerDebug(): {
  wrapper_path_tried: string | null;
  configured: boolean;
  set_worker_error?: string;
} {
  return { ...pdfWorkerDebug };
}

const MIME_EXT_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".html": "text/html",
  ".xml": "application/xml",
  ".md": "text/markdown",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".parquet": "application/x-parquet",
};

export function getMimeTypeFromExtension(ext: string): string | null {
  const normalized = ext.toLowerCase();
  if (!normalized.startsWith(".")) {
    return MIME_EXT_MAP["." + normalized] ?? null;
  }
  return MIME_EXT_MAP[normalized] ?? null;
}

/**
 * Extract plain text from a file buffer for LLM extraction.
 * PDF uses pdf-parse; text/* and common extensions return utf8 string.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string
): Promise<string> {
  const lowerName = fileName?.toLowerCase() || "";
  const lowerMime = mimeType?.toLowerCase() || "";

  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) {
    try {
      await ensurePdfCanvasPolyfill();
      const module = await import("pdf-parse");
      const PdfParse =
        (
          module as {
            PDFParse?: new (options: { data: Buffer }) => {
              getText(): Promise<{ text?: string }>;
              getScreenshot(params?: { first?: number; imageDataUrl?: boolean }): Promise<{ pages: Array<{ dataUrl?: string }> }>;
              destroy(): Promise<void>;
            };
          }
        ).PDFParse ?? (module as { default?: unknown }).default;
      if (!PdfParse) {
        return "";
      }
      const parser = new (PdfParse as new (opts: { data: Buffer }) => {
        getText(): Promise<{ text?: string }>;
        getScreenshot(params?: { first?: number }): Promise<{ pages: Array<{ dataUrl?: string }> }>;
        destroy(): Promise<void>;
      })({ data: buffer });
      const { text } = await parser.getText();
      const textOut = text?.trim() ?? "";
      await parser.destroy?.();
      return textOut;
    } catch (error) {
      logger.warn("Failed to parse PDF for extraction:", error);
      return "";
    }
  }

  if (lowerMime.startsWith("text/") || lowerMime.includes("json") || lowerMime.includes("xml")) {
    return buffer.toString("utf8");
  }

  if (
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json") ||
    lowerName.endsWith(".md")
  ) {
    return buffer.toString("utf8");
  }

  return "";
}

export interface GetPdfFirstPageResult {
  dataUrl: string | null;
  error?: string;
}

/**
 * Polyfill globalThis with canvas APIs required by pdfjs-dist in Node so that
 * the fake worker (which runs in the main thread) can access DOMMatrix etc.
 * Must run before any pdf-parse/pdfjs import.
 */
async function ensurePdfCanvasPolyfill(): Promise<void> {
  if (typeof (globalThis as Record<string, unknown>).DOMMatrix !== "undefined") {
    if (!pdfGlobalsPolyfilled) {
      pdfGlobalsPolyfilled = true;
      pdfWorkerDebug = { wrapper_path_tried: "already-in-globalThis", configured: true };
    }
    return;
  }
  try {
    const canvas = await import("@napi-rs/canvas");
    if (canvas.DOMMatrix) (globalThis as Record<string, unknown>).DOMMatrix = canvas.DOMMatrix;
    if (canvas.ImageData) (globalThis as Record<string, unknown>).ImageData = canvas.ImageData;
    if (canvas.Path2D) (globalThis as Record<string, unknown>).Path2D = canvas.Path2D;
    pdfGlobalsPolyfilled = true;
    pdfWorkerDebug = { wrapper_path_tried: "@napi-rs/canvas (globalThis polyfill)", configured: true };
    logger.debug("PDF canvas globals polyfilled from @napi-rs/canvas");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pdfWorkerDebug = { wrapper_path_tried: "@napi-rs/canvas (failed)", configured: false, set_worker_error: msg };
    logger.warn("Failed to polyfill PDF canvas globals: %s", msg);
  }
}

/**
 * Render the first page of a PDF to an image data URL for vision-based extraction.
 * Use when extractTextFromBuffer returns empty (e.g. scanned/image-only PDFs).
 * Returns { dataUrl, error? } so callers can surface failure reason.
 */
export async function getPdfFirstPageImageDataUrl(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string
): Promise<string | null>;
export async function getPdfFirstPageImageDataUrl(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string,
  opts?: { returnError: true }
): Promise<GetPdfFirstPageResult>;
export async function getPdfFirstPageImageDataUrl(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string,
  opts?: { returnError?: boolean }
): Promise<string | null | GetPdfFirstPageResult> {
  const lowerName = fileName?.toLowerCase() || "";
  const lowerMime = mimeType?.toLowerCase() || "";
  if (!lowerMime.includes("pdf") && !lowerName.endsWith(".pdf")) {
    return opts?.returnError ? { dataUrl: null, error: "not_pdf" } : null;
  }
  try {
    await ensurePdfCanvasPolyfill();
    const module = await import("pdf-parse");
    const PdfParse = (module as { PDFParse?: unknown }).PDFParse ?? (module as { default?: unknown }).default;
    if (!PdfParse) {
      return opts?.returnError ? { dataUrl: null, error: "PDFParse_not_found" } : null;
    }
    const PDFParseClass = PdfParse as {
      new (opts: { data: Buffer }): {
        getScreenshot(params?: { first?: number; imageDataUrl?: boolean; imageBuffer?: boolean }): Promise<{
          pages: Array<{ dataUrl?: string; data?: Uint8Array | Buffer }>;
        }>;
        destroy(): Promise<void>;
      };
    };
    const parser = new PDFParseClass({ data: buffer });
    const result = await parser.getScreenshot({ first: 1, imageDataUrl: true, imageBuffer: true });
    await parser.destroy?.();
    const page = result?.pages?.[0];
    if (!page) {
      return opts?.returnError ? { dataUrl: null, error: "no_pages" } : null;
    }
    let dataUrl: string | null = page.dataUrl ?? null;
    if (!dataUrl && page.data && (page.data instanceof Uint8Array || Buffer.isBuffer(page.data))) {
      dataUrl = `data:image/png;base64,${Buffer.from(page.data).toString("base64")}`;
    }
    return opts?.returnError ? { dataUrl, error: dataUrl ? undefined : "no_image_data" } : dataUrl;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to render PDF first page for vision fallback:", error);
    return opts?.returnError ? { dataUrl: null, error: msg } : null;
  }
}
