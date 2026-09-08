/**
 * Static write-path coverage: FileInputError must keep its structured envelope
 * on every surface (#2325 / #2350 rereview). Same class of drift that
 * StorePolicyDeniedError had — REST kept the code, MCP fell through to
 * InternalError.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("ERR_FILE_* keeps its structured envelope on every surface", () => {
  it("the MCP tool-call catch block branches on FileInputError", () => {
    const src = stripComments(read("src/server.ts"));
    expect(
      src.includes("error instanceof FileInputError"),
      "src/server.ts must branch on FileInputError in the CallToolRequestSchema " +
        "catch block so data.code reaches MCP clients (not InternalError)."
    ).toBe(true);
  });

  it("both transports build the envelope from the error itself", () => {
    const errorSrc = stripComments(read("src/services/file_input_diagnostics.ts"));
    expect(
      errorSrc.includes("toErrorEnvelope"),
      "FileInputError must expose toErrorEnvelope() as the single definition of the envelope"
    ).toBe(true);

    expect(
      stripComments(read("src/server.ts")).includes("toErrorEnvelope()"),
      "src/server.ts must render FileInputError via error.toErrorEnvelope()"
    ).toBe(true);
  });

  it("MCP store() parquet and reference file_path branches call the locality gate", () => {
    const src = stripComments(read("src/server.ts"));
    // Both branches must mention the guard near storeRawReference / readParquetFile.
    expect(src.includes("buildFilePathServerLocalError")).toBe(true);
    expect(src.includes("isFilesystemLocalToCaller")).toBe(true);
    expect(src.includes("storeRawReference")).toBe(true);
    expect(src.includes("readParquetFile")).toBe(true);
  });
});
