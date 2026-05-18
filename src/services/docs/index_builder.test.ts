import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDocsIndex, type DocsManifest } from "./index_builder.js";

let tmpRoot: string;
let docsRoot: string;

const MANIFEST: DocsManifest = {
  categories: [
    {
      key: "foundation",
      display_name: "Foundation",
      order: 20,
      subcategories: [],
    },
    {
      key: "architecture",
      display_name: "Architecture",
      order: 30,
      subcategories: [
        { key: "subsystems", display_name: "Subsystems", order: 10 },
      ],
    },
    {
      key: "internal",
      display_name: "Internal",
      order: 200,
      subcategories: [
        { key: "plans", display_name: "Plans", order: 20 },
      ],
    },
  ],
  featured: ["docs/foundation/core_identity.md"],
};

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-docs-idx-"));
  docsRoot = path.join(tmpRoot, "docs");
  fs.mkdirSync(path.join(docsRoot, "foundation"), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, "architecture"), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, "subsystems"), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, "plans"), { recursive: true });
  fs.writeFileSync(
    path.join(docsRoot, "foundation", "core_identity.md"),
    "# Core Identity\n\nState Layer.\n",
  );
  fs.writeFileSync(
    path.join(docsRoot, "foundation", "philosophy.md"),
    "# Philosophy\n\nPrinciples.\n",
  );
  fs.writeFileSync(
    path.join(docsRoot, "architecture", "architecture.md"),
    "# Architecture\n\nSystem.\n",
  );
  fs.writeFileSync(
    path.join(docsRoot, "subsystems", "ingestion.md"),
    "# Ingestion\n\nIngestion subsystem.\n",
  );
  fs.writeFileSync(
    path.join(docsRoot, "plans", "draft.md"),
    "# Draft Plan\n\nNot ready.\n",
  );
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("buildDocsIndex", () => {
  it("groups docs by category and subcategory", () => {
    const idx = buildDocsIndex({ docsRoot, manifest: MANIFEST, env: { NODE_ENV: "production" } });
    const foundation = idx.categories.find((c) => c.key === "foundation")!;
    expect(foundation).toBeDefined();
    expect(foundation.uncategorized.map((d) => d.slug)).toEqual([
      "foundation/core_identity",
      "foundation/philosophy",
    ]);
    const architecture = idx.categories.find((c) => c.key === "architecture")!;
    expect(architecture.subcategories.find((s) => s.key === "subsystems")!.docs.map((d) => d.slug)).toEqual([
      "subsystems/ingestion",
    ]);
  });

  it("hides internal docs in production", () => {
    const idx = buildDocsIndex({ docsRoot, manifest: MANIFEST, env: { NODE_ENV: "production" } });
    const internal = idx.categories.find((c) => c.key === "internal");
    expect(internal).toBeUndefined();
  });

  it("shows internal docs with the show-internal flag", () => {
    const idx = buildDocsIndex({
      docsRoot,
      manifest: MANIFEST,
      env: { NODE_ENV: "production", NEOTOMA_DOCS_SHOW_INTERNAL: "true" },
    });
    const internal = idx.categories.find((c) => c.key === "internal")!;
    expect(internal.subcategories.find((s) => s.key === "plans")!.docs.map((d) => d.slug)).toEqual([
      "plans/draft",
    ]);
  });

  it("populates the featured list in manifest order, filtered by visibility", () => {
    const idx = buildDocsIndex({ docsRoot, manifest: MANIFEST, env: { NODE_ENV: "production" } });
    expect(idx.featured.map((d) => d.repo_path)).toEqual(["docs/foundation/core_identity.md"]);
  });

  it("returns a deterministic tree across runs", () => {
    const a = buildDocsIndex({ docsRoot, manifest: MANIFEST, env: { NODE_ENV: "production" } });
    const b = buildDocsIndex({ docsRoot, manifest: MANIFEST, env: { NODE_ENV: "production" } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
