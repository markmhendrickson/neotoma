import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("skips a `private/` folder nested inside a kept top-level folder", () => {
    // `private` is a BUNDLE_SKIP_DIR at any depth, not just at the top level:
    // a sensitive subtree inside an otherwise-public folder must not leak.
    const abs = path.join(docsRoot, "foundation/private/sensitive.md");
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "# Sensitive\n\nHidden.\n");
    const collected = collectBundleMarkdown(docsRoot);
    expect(collected.some((rel) => rel.includes("private/"))).toBe(false);
    const plan = planBundledDocs(docsRoot, new Map());
    expect([...plan.include, ...plan.skippedInternal, ...plan.skippedDeprecated]).not.toContain(
      "foundation/private/sensitive.md"
    );
  });

  it("lets a manifest `internal_only` status force an un-frontmattered doc internal", () => {
    // foundation/ defaults to public, but a manifest entry overrides that when
    // the doc declares no explicit `visibility` of its own.
    fs.writeFileSync(
      path.join(docsRoot, "foundation/managed.md"),
      "# Managed\n\nNo frontmatter.\n"
    );
    const entries = new Map([["docs/foundation/managed.md", { status: "internal_only" }]]);
    const plan = planBundledDocs(docsRoot, entries);
    expect(plan.skippedInternal).toContain("foundation/managed.md");
    expect(plan.include).not.toContain("foundation/managed.md");
  });

  it("does not crash on malformed frontmatter and falls back to the folder default", () => {
    // The frontmatter block is not parseable key/value YAML. The parser skips the
    // unrecognized lines, so no `visibility` is found and the foundation/ folder
    // default (public) applies. The planner must not throw.
    fs.writeFileSync(
      path.join(docsRoot, "foundation/malformed.md"),
      "---\n: : : not valid\n\t- broken\n---\n\n# Malformed\n\nBody.\n"
    );
    let plan: ReturnType<typeof planBundledDocs> | undefined;
    expect(() => {
      plan = planBundledDocs(docsRoot, new Map());
    }).not.toThrow();
    expect(plan?.include).toContain("foundation/malformed.md");
  });

  it("skips a doc whose file read throws, keeping its siblings", () => {
    fs.writeFileSync(path.join(docsRoot, "foundation/readable.md"), "# Readable\n\nVisible.\n");
    fs.writeFileSync(path.join(docsRoot, "foundation/unreadable.md"), "# Unreadable\n\nVisible.\n");
    const realReadFileSync = fs.readFileSync;
    const spy = vi.spyOn(fs, "readFileSync").mockImplementation(((p: unknown) => {
      if (typeof p === "string" && p.endsWith("unreadable.md")) {
        throw new Error("EACCES: simulated unreadable file");
      }
      return realReadFileSync(p as string, "utf-8");
    }) as unknown as typeof fs.readFileSync);
    try {
      const plan = planBundledDocs(docsRoot, new Map());
      expect(plan.include).toContain("foundation/readable.md");
      expect(plan.include).not.toContain("foundation/unreadable.md");
    } finally {
      spy.mockRestore();
    }
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

  it("sorts a top-level file before a same-named folder's children", () => {
    // `foundation.md` vs `foundation/...`: '.' (0x2E) sorts before '/' (0x2F),
    // so the top-level file must precede the folder's docs in bundle order.
    fs.writeFileSync(path.join(docsRoot, "foundation.md"), "# Foundation\n\nTop-level.\n");
    fs.writeFileSync(path.join(docsRoot, "foundation/file.md"), "# File\n\nIn folder.\n");
    const collected = collectBundleMarkdown(docsRoot);
    const iFile = collected.indexOf("foundation.md");
    const iFolder = collected.indexOf("foundation/file.md");
    expect(iFile).toBeGreaterThanOrEqual(0);
    expect(iFolder).toBeGreaterThan(iFile);
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
