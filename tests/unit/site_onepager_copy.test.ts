import { createHash } from "node:crypto";
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

  it("has no old app header or footer and links only to /install, GitHub, npm and held routes", () => {
    const page = files[0];
    expect(page).not.toContain("SiteTailpiece");
    expect(page).not.toContain("SiteHeaderNav");
    const internal = [...page.matchAll(/to="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(
      internal.every((r) => r === "/install"),
      `internal links: ${internal.join(" ")}`
    ).toBe(true);
    const copy = files[1];
    for (const needle of [
      "#readme",
      "/tree/main/docs",
      "docs/architecture/architecture.md",
      "docs/integrations/matrix.md",
      "/releases",
      "npmjs.com/package/neotoma",
      "/issues",
      "/discussions",
    ]) {
      expect(copy, `deeper material is missing ${needle}`).toContain(needle);
    }
  });
});

describe("accepted Neotoma logo", () => {
  const brand = join(root, "frontend", "public", "brand");
  it("keeps the accepted source files byte for byte (sha256 from PROVENANCE.json)", () => {
    const prov = JSON.parse(readFileSync(join(brand, "PROVENANCE.json"), "utf-8"));
    for (const [file, info] of Object.entries(prov.files) as [string, { sha256?: string }][]) {
      if (!info.sha256) continue;
      const digest = createHash("sha256")
        .update(readFileSync(join(brand, file)))
        .digest("hex");
      expect(digest, file).toBe(info.sha256);
    }
  });

  it("derives the drafting variant from the accepted geometry without changing any path", async () => {
    // @ts-expect-error plain ESM script
    const { buildOutputs, parseLockup } =
      await import("../../scripts/derive_neotoma_logo_drafting.mjs");
    const source = readFileSync(join(brand, "n2-nav-light.svg"), "utf-8");
    const out = buildOutputs(source);
    expect(readFileSync(join(brand, "neotoma-lockup-drafting.svg"), "utf-8")).toBe(out.staticSvg);
    const generated = readFileSync(join(dir, "neotoma_logo_drafting.generated.ts"), "utf-8");
    expect(generated).toBe(out.ts);
    const src = parseLockup(source);
    const derived = parseLockup(out.staticSvg);
    const flat = (l: typeof src) =>
      l.groups.flatMap(
        (g: { transform: string; paths: { transform: string | null; d: string }[] }) =>
          g.paths.map((p) => [g.transform, p.transform, p.d])
      );
    expect(flat(derived)).toEqual(flat(src));
    expect(flat(src).length).toBeGreaterThan(5);
    expect(out.staticSvg).not.toMatch(/fill="#/);
  });

  it("does not use retired marks (old N-on-gradient favicon, retired wordmark) in the page or favicon", () => {
    const favicon = readFileSync(join(root, "frontend", "public", "favicon.svg"), "utf-8");
    expect(favicon).toBe(readFileSync(join(brand, "neotoma-icon-32.svg"), "utf-8"));
    expect(all).not.toContain("neotoma-wordmark.svg");
  });
});
