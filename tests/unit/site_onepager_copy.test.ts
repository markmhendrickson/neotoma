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
  readFileSync(join(dir, f), "utf-8")
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

  describe("pages reachable from the one-pager", () => {
    const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
    const evaluate = read("frontend/src/i18n/locales/evaluate_subpage_strings.ts");
    // English strings only: other locales keep their translations until reviewed ones exist.
    const evaluateEn = evaluate.slice(
      evaluate.indexOf("export const EVALUATE_SUBPAGE_EN"),
      evaluate.indexOf("export const", evaluate.indexOf("export const EVALUATE_SUBPAGE_EN") + 10)
    );
    const packs = read("frontend/src/i18n/locales/subpage_packs.ts");
    const hostedEn = /hostedNeotoma: "([^"]*)"/.exec(packs)?.[1];
    const covered: Record<string, string> = {
      "comparison pages": stripComments(
        read("frontend/src/components/subpages/ComparisonPage.tsx")
      ),
      "evaluate page (English strings)": evaluateEn,
      "comparison route SEO metadata": (() => {
        const seo = read("frontend/src/site/seo_metadata.ts");
        const start = seo.indexOf('"/neotoma-vs-platform-memory": {');
        return seo.slice(start, seo.indexOf('"/neotoma-vs-rag": {') + 1800);
      })(),
      "evaluate SEO": read("frontend/src/site/seo_metadata.ts").slice(
        read("frontend/src/site/seo_metadata.ts").indexOf('"/evaluate": {'),
        read("frontend/src/site/seo_metadata.ts").indexOf('"/evaluate": {') + 900
      ),
    };
    const forbidden: [RegExp, string][] = [
      [/deterministic state layer/i, "retired category noun"],
      [/shared state layer/i, "retired category noun"],
      [/append-only/i, "database-enforced append-only"],
      [
        /point in time|point-in-time|any past moment|any point in time/i,
        "one-call point-in-time state",
      ],
      [/formal (state integrity )?guarantees?/i, "formal guarantees"],
      [/temporal state quer/i, "temporal state queries"],
      [/\bpick up where they left off/i, "recall framing"],
      [/correction sticks everywhere/i, "corrections always win"],
    ];
    for (const [label, text] of Object.entries(covered)) {
      it(`${label} carry no retired frame or unsupported claim`, () => {
        for (const [re, why] of forbidden) {
          expect(re.test(text), `${label}: ${why} (${re})`).toBe(false);
        }
      });
    }

    it("does not label the hosting page as a hosted product", () => {
      expect(hostedEn).toBe("Hosting options");
      expect(read("frontend/src/site/site_data.ts")).not.toContain('label: "Hosted Neotoma"');
      expect(read("frontend/src/components/subpages/HostedLandingPage.tsx")).not.toContain(
        'detailTitle="Hosted Neotoma"'
      );
    });
  });
});
