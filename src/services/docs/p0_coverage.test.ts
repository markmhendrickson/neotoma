import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { getBundledDocsIndex } from "./index.js";

/**
 * Onboarding guard: the P0 getting-started docs must remain public and featured
 * so a new user lands on the intended path. This catches a silent regression
 * (a doc renamed, marked internal, or dropped from the featured list).
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const P0_SLUGS = [
  "getting_started/what_is_neotoma",
  "getting_started/getting_started",
  "getting_started/using_the_inspector",
  "getting_started/working_with_your_memory",
];

describe("P0 onboarding docs coverage", () => {
  const index = getBundledDocsIndex({ repoRoot, envSource: { NODE_ENV: "production" } });
  const slugs = new Set<string>();
  for (const doc of index.featured) slugs.add(doc.slug);
  for (const cat of index.categories) {
    for (const doc of cat.uncategorized) slugs.add(doc.slug);
    for (const sub of cat.subcategories) for (const doc of sub.docs) slugs.add(doc.slug);
  }

  it("ships the P0 getting-started docs publicly", () => {
    for (const s of P0_SLUGS) {
      expect(slugs.has(s), `missing P0 doc in public index: ${s}`).toBe(true);
    }
  });

  it("leads the featured list with the getting-started docs, in order", () => {
    const leadingSlugs = index.featured.slice(0, P0_SLUGS.length).map((d) => d.slug);
    expect(leadingSlugs).toEqual(P0_SLUGS);
  });

  it("keeps the P0 docs public and non-deprecated", () => {
    for (const s of P0_SLUGS) {
      const entry = index.featured.find((d) => d.slug === s);
      expect(entry, `P0 doc not featured: ${s}`).toBeTruthy();
      expect(entry?.frontmatter.visibility).toBe("public");
      expect(entry?.frontmatter.deprecated ?? false).toBe(false);
    }
  });
});
