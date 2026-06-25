import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planBundledDocs, collectBundleMarkdown } from "./bundle_plan.js";

describe("planBundledDocs", () => {
  let docsRoot: string;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-bundle-plan-"));
    const write = (rel: string, body: string) => {
      const abs = path.join(docsRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    };
    write("foundation/public.md", "# Public\n\nVisible.\n");
    write("foundation/secret.md", "---\nvisibility: internal\n---\n\n# Secret\n\nHidden.\n");
    write("foundation/old.md", "---\ndeprecated: true\n---\n\n# Old\n\nGone.\n");
    // plans/ is an excluded top-level folder: never collected.
    write("plans/draft.md", "# Draft\n\nInternal plan.\n");
    // site/ is excluded too.
    write("site/page.md", "# Site\n\nMarketing.\n");
  });

  afterEach(() => {
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  it("includes only public, non-deprecated docs in non-excluded folders", () => {
    const plan = planBundledDocs(docsRoot, new Map());
    expect(plan.include).toEqual(["foundation/public.md"]);
  });

  it("uses the folder-level visibility default for un-frontmattered docs", () => {
    // foundation/public.md has no frontmatter; foundation/ defaults to public,
    // so it is included via the resolved folder default (not an explicit flag).
    const plan = planBundledDocs(docsRoot, new Map());
    expect(plan.include).toContain("foundation/public.md");
  });

  it("skips docs whose resolved visibility is internal", () => {
    const plan = planBundledDocs(docsRoot, new Map());
    expect(plan.skippedInternal).toContain("foundation/secret.md");
    expect(plan.include).not.toContain("foundation/secret.md");
  });

  it("skips deprecated docs", () => {
    const plan = planBundledDocs(docsRoot, new Map());
    expect(plan.skippedDeprecated).toContain("foundation/old.md");
    expect(plan.include).not.toContain("foundation/old.md");
  });

  it("never collects excluded top-level folders", () => {
    const collected = collectBundleMarkdown(docsRoot);
    expect(collected.some((rel) => rel.startsWith("plans/"))).toBe(false);
    expect(collected.some((rel) => rel.startsWith("site/"))).toBe(false);
    const plan = planBundledDocs(docsRoot, new Map());
    expect([...plan.include, ...plan.skippedInternal, ...plan.skippedDeprecated]).not.toContain(
      "plans/draft.md"
    );
  });
});

describe("planBundledDocs edge cases", () => {
  let docsRoot: string;

  beforeEach(() => {
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-bundle-plan-edge-"));
    const write = (rel: string, body: string) => {
      const abs = path.join(docsRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    };
    write("foundation/a_public.md", "# A\n\nVisible.\n");
    write("foundation/z_public.md", "# Z\n\nVisible.\n");
    write("subsystems/deep/nested.md", "# Nested\n\nDeep but kept.\n");
    // `archived/` is a skip-dir anywhere in the tree.
    write("foundation/archived/legacy.md", "# Legacy\n\nArchived.\n");
  });

  afterEach(() => {
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  it("includes public docs nested deep inside kept folders", () => {
    const plan = planBundledDocs(docsRoot, new Map());
    expect(plan.include).toContain("subsystems/deep/nested.md");
  });

  it("skips archived/ anywhere in the tree", () => {
    const collected = collectBundleMarkdown(docsRoot);
    expect(collected.some((rel) => rel.includes("archived/"))).toBe(false);
  });

  it("returns docs in deterministic sorted order", () => {
    const a = collectBundleMarkdown(docsRoot);
    const b = collectBundleMarkdown(docsRoot);
    expect(a).toEqual([...a].sort());
    expect(a).toEqual(b);
  });

  it("handles a missing docs root without throwing", () => {
    const missing = path.join(docsRoot, "does-not-exist");
    expect(collectBundleMarkdown(missing)).toEqual([]);
    expect(planBundledDocs(missing, new Map())).toEqual({
      include: [],
      skippedInternal: [],
      skippedDeprecated: [],
    });
  });
});
