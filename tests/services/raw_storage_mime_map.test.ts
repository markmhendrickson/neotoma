/**
 * Unit tests for the extension → MIME map used by `storeRawReference`
 * (src/services/raw_storage.ts), specifically the script-extension entries
 * added for instance-script attachments (#1951). Pure function, no database
 * or network involved — see tests/services/raw_storage.test.ts for the
 * DB-backed integration coverage of `storeRawContent`/`storeRawReference`.
 */

import { describe, it, expect } from "vitest";
import { resolveMimeTypeFromExtension } from "../../src/services/raw_storage.ts";

describe("resolveMimeTypeFromExtension", () => {
  it("maps script extensions added for instance-script attachments", () => {
    expect(resolveMimeTypeFromExtension(".py")).toBe("text/x-python");
    expect(resolveMimeTypeFromExtension(".sh")).toBe("application/x-sh");
    expect(resolveMimeTypeFromExtension(".js")).toBe("text/javascript");
    expect(resolveMimeTypeFromExtension(".ts")).toBe("text/typescript");
    expect(resolveMimeTypeFromExtension(".rb")).toBe("application/x-ruby");
    expect(resolveMimeTypeFromExtension(".sql")).toBe("application/sql");
  });

  it("deliberately avoids the IANA video/mp2t trap for .ts", () => {
    expect(resolveMimeTypeFromExtension(".ts")).not.toBe("video/mp2t");
  });

  it("preserves existing document-type mappings", () => {
    expect(resolveMimeTypeFromExtension(".pdf")).toBe("application/pdf");
    expect(resolveMimeTypeFromExtension(".md")).toBe("text/markdown");
    expect(resolveMimeTypeFromExtension(".json")).toBe("application/json");
  });

  it("is case-insensitive", () => {
    expect(resolveMimeTypeFromExtension(".PY")).toBe("text/x-python");
  });

  it("falls back to application/octet-stream for unknown extensions", () => {
    expect(resolveMimeTypeFromExtension(".xyz")).toBe("application/octet-stream");
  });
});
