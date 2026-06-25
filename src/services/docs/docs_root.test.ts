import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveDocsSources } from "./docs_root.js";

describe("resolveDocsSources", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-docs-root-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("prefers the source checkout when the manifest is present", () => {
    const docsDir = path.join(tmp, "docs", "site");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "site_doc_manifest.yaml"), "version: 1\n");

    const res = resolveDocsSources(tmp, path.join(tmp, "bundled"));

    expect(res.source).toBe("checkout");
    expect(res.docsRoot).toBe(path.join(tmp, "docs"));
    expect(res.manifestPath).toBe(path.join(tmp, "docs", "site", "site_doc_manifest.yaml"));
  });

  it("falls back to the bundled docs dir when no source manifest exists", () => {
    // repoRoot has no docs/site/site_doc_manifest.yaml (simulates an npm install).
    const bundled = path.join(tmp, "dist", "docs");

    const res = resolveDocsSources(tmp, bundled);

    expect(res.source).toBe("bundled");
    expect(res.docsRoot).toBe(bundled);
    expect(res.manifestPath).toBe(path.join(bundled, "site", "site_doc_manifest.yaml"));
  });
});
