import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManifest } from "./manifest_loader.js";

let tmpDir: string;
let manifestPath: string;

const SAMPLE = `version: 1
entries:
  - repo_path: docs/foundation/problem_statement.md
    status: supporting_source
    canonical_site_path: /foundation/problem-statement
  - repo_path: docs/reports/old.md
    status: archive

categories:
  - key: foundation
    display_name: "Foundation"
    description: "Core identity."
    order: 20
    subcategories: []
  - key: architecture
    display_name: "Architecture"
    order: 30
    subcategories:
      - key: subsystems
        display_name: "Subsystems"
        order: 10
      - key: specs
        display_name: "Specs"
        order: 20

featured:
  - docs/foundation/core_identity.md
  - docs/architecture/architecture.md
`;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-manifest-"));
  manifestPath = path.join(tmpDir, "site_doc_manifest.yaml");
  fs.writeFileSync(manifestPath, SAMPLE);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadManifest", () => {
  it("parses entries with status", () => {
    const m = loadManifest(manifestPath);
    expect(m.entries.size).toBe(2);
    expect(m.entries.get("docs/foundation/problem_statement.md")?.status).toBe("supporting_source");
    expect(m.entries.get("docs/reports/old.md")?.status).toBe("archive");
  });

  it("parses categories with subcategories", () => {
    const m = loadManifest(manifestPath);
    expect(m.docs.categories.map((c) => c.key)).toEqual(["foundation", "architecture"]);
    const arch = m.docs.categories.find((c) => c.key === "architecture")!;
    expect(arch.display_name).toBe("Architecture");
    expect(arch.order).toBe(30);
    expect(arch.subcategories.map((s) => s.key)).toEqual(["subsystems", "specs"]);
  });

  it("parses the featured list in order", () => {
    const m = loadManifest(manifestPath);
    expect(m.docs.featured).toEqual([
      "docs/foundation/core_identity.md",
      "docs/architecture/architecture.md",
    ]);
  });

  it("returns empty manifest when file does not exist", () => {
    const m = loadManifest(path.join(tmpDir, "missing.yaml"));
    expect(m.docs.categories).toEqual([]);
    expect(m.docs.featured).toEqual([]);
    expect(m.entries.size).toBe(0);
  });
});
