import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the neotoma.io developer one-pager (home route).
 *
 * The copy makes only claims that were verified against the build (see the pull request that
 * added the page). These tests fail when copy drifts into a claim the build cannot support, or
 * back to a retired category frame. Revert-check: add "hosted Neotoma" to onepager_copy.ts and
 * the forbidden-claims test goes red.
 */
const root = join(__dirname, "..", "..");
const dir = join(root, "frontend", "src", "components", "onepager");
const files = ["NeotomaOnePager.tsx", "onepager_copy.ts", "onepager_figures.tsx"].map((f) =>
  readFileSync(join(dir, f), "utf-8"),
);
// Doc comments list what is deliberately not claimed; only shipped copy is checked.
const all = files.join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

describe("neotoma.io one-pager copy", () => {
  it("uses no em dashes", () => {
    expect(all.includes("—")).toBe(false);
    expect(all.includes("&mdash;")).toBe(false);
  });

  it("states the current category and the lead contrast", () => {
    expect(all).toContain("A record, not recall.");
    expect(all).toContain("the system of record for AI agents");
  });

  it("does not make claims the build cannot support", () => {
    const forbidden: [RegExp, string][] = [
      [/hosted neotoma/i, "hosted Neotoma for sale"],
      [/export(ed|s)? (with|including) (full )?history/i, "export with history"],
      [/unified platform/i, "unified platform"],
      [/multi-operator/i, "multi-operator authority"],
      [/corrections? always win/i, "corrections always win"],
      [/append-only/i, "database-enforced append-only"],
      [/point-in-time/i, "one-call point-in-time state"],
      [/follows? a changed objective/i, "Ateles follows a changed objective"],
    ];
    for (const [re, label] of forbidden) {
      expect(re.test(all), `forbidden claim present: ${label}`).toBe(false);
    }
  });

  it("does not return to retired category frames", () => {
    for (const re of [/state layer/i, /memory layer/i, /agents forget/i, /makes them remember/i]) {
      expect(re.test(all), `retired frame present: ${re}`).toBe(false);
    }
  });

  it("keeps the install page one click away at exactly /install", () => {
    expect(files[0]).toContain('to="/install"');
  });

  it("is the home route for English and Spanish", () => {
    for (const locale of ["en", "es"]) {
      const mdx = readFileSync(join(root, "docs", "site", "pages", locale, "home.mdx"), "utf-8");
      expect(mdx).toContain("NeotomaOnePager");
    }
  });
});
