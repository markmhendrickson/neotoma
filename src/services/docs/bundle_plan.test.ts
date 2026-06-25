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
