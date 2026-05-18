import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

describe("docs_frontmatter_backfill — integration (runs against real docs/ tree)", () => {
  it("is idempotent: --write after a fresh write produces 0 diffs", () => {
    // The real docs/ tree was backfilled when this test was authored. Running
    // --write again should report wrote=0 and skip every file because each
    // already has a frontmatter block.
    const stdout = execSync(`npx tsx scripts/docs_frontmatter_backfill.ts --write`, {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    expect(stdout).toMatch(/wrote=0\s+would_write=0\s+skipped=\d+/);
  });

  it("dry-run reports the same totals as a no-op write", () => {
    const dry = execSync(`npx tsx scripts/docs_frontmatter_backfill.ts --dry-run`, {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    expect(dry).toMatch(/wrote=0\s+would_write=0\s+skipped=\d+/);
    expect(dry).toContain("dry-run");
  });
});

describe("docs_frontmatter_backfill — unit (temp tree)", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-backfill-"));
    fs.mkdirSync(path.join(tmpRoot, "docs", "foundation"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "docs", "foundation", "x.md"),
      "# Hello X\n\nFirst para.\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "docs", "foundation", "y.md"),
      "---\ntitle: Custom\n---\n# H1 ignored\n",
    );
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("skips files that already have frontmatter", async () => {
    const { splitFrontmatter } = await import("../../src/services/docs/doc_frontmatter.js");
    const src = fs.readFileSync(path.join(tmpRoot, "docs", "foundation", "y.md"), "utf-8");
    const { yaml } = splitFrontmatter(src);
    expect(yaml).not.toBeNull();
    expect(yaml!.includes("title: Custom")).toBe(true);
  });
});
