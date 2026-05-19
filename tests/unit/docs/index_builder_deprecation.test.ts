import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDocsIndex } from "../../../src/services/docs/index_builder";
import { lookupDoc } from "../../../src/services/docs/render";

interface DocFixture {
  rel: string;
  contents: string;
}

const FIXTURES: DocFixture[] = [
  {
    rel: "developer/index.md",
    contents:
      "---\n" +
      "title: Developer reference\n" +
      "summary: Developer reference root.\n" +
      "category: developer_reference\n" +
      "audience: developer\n" +
      "visibility: public\n" +
      "---\n\n" +
      "# Developer reference\n",
  },
  {
    rel: "developer/active_doc.md",
    contents:
      "---\n" +
      "title: Active doc\n" +
      "summary: Lives in the index.\n" +
      "category: developer_reference\n" +
      "audience: developer\n" +
      "visibility: public\n" +
      "---\n\n" +
      "# Active doc\n\nBody.\n",
  },
  {
    rel: "developer/deprecated_doc.md",
    contents:
      "---\n" +
      "title: Deprecated doc\n" +
      "summary: Should be hidden by default.\n" +
      "category: developer_reference\n" +
      "audience: developer\n" +
      "visibility: public\n" +
      "deprecated: true\n" +
      "superseded_by: developer/active_doc\n" +
      "deprecation_reason: Replaced by active_doc.\n" +
      "---\n\n" +
      "# Deprecated doc\n",
  },
];

function makeManifest() {
  return {
    categories: [
      {
        key: "developer_reference",
        display_name: "Developer reference",
        description: null as string | null,
        order: 60,
        subcategories: [],
      },
    ],
    featured: [] as string[],
  };
}

describe("buildDocsIndex deprecation filter", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "docs-dep-"));
    for (const f of FIXTURES) {
      const abs = path.join(tmp, f.rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.contents);
    }
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("excludes deprecated docs by default", () => {
    const index = buildDocsIndex({
      docsRoot: tmp,
      manifest: makeManifest(),
      env: { NODE_ENV: "production" },
    });
    const slugs = collectSlugs(index);
    expect(slugs).toContain("developer/active_doc");
    expect(slugs).not.toContain("developer/deprecated_doc");
  });

  it("includes deprecated docs when includeDeprecated: true", () => {
    const index = buildDocsIndex({
      docsRoot: tmp,
      manifest: makeManifest(),
      env: { NODE_ENV: "production" },
      includeDeprecated: true,
    });
    const slugs = collectSlugs(index);
    expect(slugs).toContain("developer/deprecated_doc");
    expect(slugs).toContain("developer/active_doc");
  });

  it("direct slug lookup still resolves deprecated docs and carries the deprecation fields", () => {
    const result = lookupDoc("developer/deprecated_doc", {
      docsRoot: tmp,
      env: { NODE_ENV: "production" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.frontmatter.deprecated).toBe(true);
    expect(result.doc.frontmatter.superseded_by).toBe("developer/active_doc");
    expect(result.doc.frontmatter.deprecation_reason).toBe("Replaced by active_doc.");
  });
});

function collectSlugs(index: ReturnType<typeof buildDocsIndex>): string[] {
  const out = new Set<string>();
  for (const f of index.featured) out.add(f.slug);
  for (const cat of index.categories) {
    for (const d of cat.uncategorized) out.add(d.slug);
    for (const sub of cat.subcategories) {
      for (const d of sub.docs) out.add(d.slug);
    }
  }
  return Array.from(out);
}
