/**
 * Drift test: the server-side mirror at
 * `src/services/root_landing/site_nav.ts::ROOT_LANDING_SITE_NAV` must stay in
 * sync with the frontend's canonical `DOC_NAV_CATEGORIES` in
 * `frontend/src/site/site_data.ts`.
 *
 * We do text extraction rather than importing the frontend module directly —
 * the frontend bundle depends on Vite-only aliases that aren't resolved in the
 * server's vitest project.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ROOT_LANDING_SITE_NAV,
  type RootLandingNavCategory,
} from "../../src/services/root_landing/site_nav.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const frontendSiteDataPath = path.join(repoRoot, "frontend/src/site/site_data.ts");

/**
 * Extract the `DOC_NAV_CATEGORIES` array literal from the frontend source as
 * plain text, then parse it into the same shape as the server mirror.
 */
function extractFrontendDocNavCategories(): RootLandingNavCategory[] {
  const src = readFileSync(frontendSiteDataPath, "utf-8");
  const match = src.match(
    /export const DOC_NAV_CATEGORIES: DocNavCategory\[\]\s*=\s*(\[[^]*?\n\]);/,
  );
  if (!match) {
    throw new Error("Could not locate DOC_NAV_CATEGORIES in frontend site_data.ts");
  }
  const body = match[1];

  const categories: RootLandingNavCategory[] = [];
  const categoryRe = /\{\s*title:\s*"([^"]+)",[^]*?items:\s*\[([^]*?)\],?\s*\},?/g;
  let catMatch: RegExpExecArray | null;
  while ((catMatch = categoryRe.exec(body)) !== null) {
    const title = catMatch[1];
    const itemsBody = catMatch[2];
    const items: RootLandingNavCategory["items"] = [];
    const itemRe = /\{\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)"(?:,\s*icon:\s*"([^"]+)")?/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRe.exec(itemsBody)) !== null) {
      items.push({
        label: itemMatch[1],
        href: itemMatch[2],
        ...(itemMatch[3] ? { icon: itemMatch[3] } : {}),
      });
    }
    categories.push({ title, items });
  }
  return categories;
}

describe("root landing site nav drift", () => {
  const frontend = extractFrontendDocNavCategories();

  it("frontend extraction found at least five categories", () => {
    expect(frontend.length).toBeGreaterThanOrEqual(5);
  });

  it("server mirror has the same category titles in the same order", () => {
    const frontendTitles = frontend.map((c) => c.title);
    const mirrorTitles = ROOT_LANDING_SITE_NAV.map((c) => c.title);
    expect(mirrorTitles).toEqual(frontendTitles);
  });

  it("server mirror has the same items per category (label + href)", () => {
    for (const frontendCat of frontend) {
      const mirrorCat = ROOT_LANDING_SITE_NAV.find((c) => c.title === frontendCat.title);
      expect(mirrorCat, `missing category in mirror: ${frontendCat.title}`).toBeTruthy();
      const frontendItems = frontendCat.items.map((i) => ({ label: i.label, href: i.href }));
      const mirrorItems = mirrorCat!.items.map((i) => ({ label: i.label, href: i.href }));
      expect(
        mirrorItems,
        `items mismatch in category "${frontendCat.title}"`,
      ).toEqual(frontendItems);
    }
  });

  it("server mirror is not a strict superset (no stale entries)", () => {
    for (const mirrorCat of ROOT_LANDING_SITE_NAV) {
      const frontendCat = frontend.find((c) => c.title === mirrorCat.title);
      expect(
        frontendCat,
        `mirror has a stale category missing from frontend: ${mirrorCat.title}`,
      ).toBeTruthy();
      const frontendHrefs = new Set(frontendCat!.items.map((i) => i.href));
      for (const item of mirrorCat.items) {
        expect(
          frontendHrefs.has(item.href),
          `mirror has stale item "${item.label}" (${item.href}) in category "${mirrorCat.title}"`,
        ).toBe(true);
      }
    }
  });
});
