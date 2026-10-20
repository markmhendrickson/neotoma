import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVALUATE_SUBPAGE_EN,
  EVALUATE_SUBPAGE_ES,
} from "../../frontend/src/i18n/locales/evaluate_subpage_strings";
import { resolveSeoMetadata } from "../../frontend/src/site/seo_metadata";
import { LIVE_ROUTES } from "../../frontend/src/site/route_retirement";

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
      [/(whole|entire|every entity|all entities)[^.]{0,60}(as[- ]of|point[- ]in[- ]time)/i, "as-of read across the whole record"],
      [/no (point[- ]in[- ]time|as[- ]of)|(cannot|can't|not) (read|query) (a )?past state/i, "denies the per-entity as-of read"],
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
    const { buildOutputs, parseLockup, verifySource } =
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
    // The parser must see every <path> element: one it skips would be skipped on both sides above.
    const rawCount = (source.match(/<path\b/g) ?? []).length;
    expect(flat(src).length).toBe(rawCount);
    expect(flat(derived).length).toBe((out.staticSvg.match(/<path\b/g) ?? []).length);
    // The script refuses a source that is not the accepted file.
    const prov = JSON.parse(readFileSync(join(brand, "PROVENANCE.json"), "utf-8"));
    expect(() => verifySource(readFileSync(join(brand, "n2-nav-light.svg")), prov)).not.toThrow();
    expect(() => verifySource(Buffer.from(source.replace("#172b39", "#172b3a")), prov)).toThrow(
      /refusing to derive/
    );
    expect(() => buildOutputs(source.replace("</svg>", '<path d="M0 0L1 1"/></svg>'))).toThrow(
      /partial logo/
    );
    // Paint: ink fill under a union-outline filter. No per-path stroke (it draws overlaps between shapes).
    expect(out.staticSvg).not.toMatch(/stroke/);
  });

  it("does not use retired marks (old N-on-gradient favicon, retired wordmark) in the page or favicon", () => {
    const favicon = readFileSync(join(root, "frontend", "public", "favicon.svg"), "utf-8");
    expect(favicon).toBe(readFileSync(join(brand, "neotoma-icon-32.svg"), "utf-8"));
    expect(all).not.toContain("neotoma-wordmark.svg");
  });
});

describe("review fixes (install path, accessibility, wording)", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
  const copy = files[1];
  const page = files[0];
  const install = read("frontend/src/components/install/install_page_body.tsx");

  it("makes the install block one pasteable command set with no placeholder on a command line", () => {
    const block = /INSTALL_COMMANDS = `([^`]*)`/.exec(copy)![1];
    expect(block).toContain("neotoma setup --tool claude-code --yes");
    expect(block).not.toMatch(/[<>|]/);
    expect(page).toContain("sheet 04 table");
  });

  it("/install leads with the same command block, then the agent prompt, and has no human evaluate callout", () => {
    expect(install).toContain("INSTALL_COMMANDS");
    expect(install.indexOf("code={INSTALL_COMMANDS}")).toBeLessThan(
      install.indexOf("code={SITE_CODE_SNIPPETS.agentInstallPrompt}")
    );
    expect(install).not.toContain("startWithEvaluation");
    expect(install).not.toMatch(/to=\{lp\("\/evaluate"\)\}/);
  });

  it("describes the install integration cards without the memory frame", () => {
    const strings = read("frontend/src/i18n/locales/install_page_strings.ts");
    const en = strings.slice(
      strings.indexOf("const INTEGRATION_CARDS_EN"),
      strings.indexOf("const EXPANDED_STEPS_EN")
    );
    expect(en.length).toBeGreaterThan(200);
    expect(/memory/i.test(en), "memory frame in English integration cards").toBe(false);
  });

  it("opens the lede with the category, lets the document scroll, and names the logo for assistive tech", () => {
    expect(page).toMatch(/plan-lede">\s*Neotoma is the system of record for AI agents\./);
    expect(page).not.toContain("h-screen");
    expect(page).not.toContain("overflow-y-auto");
    const logos = files[3] ?? readFileSync(join(dir, "NeotomaLogos.tsx"), "utf-8");
    expect(logos).toContain('role="img" aria-label="Neotoma"');
  });

  it("uses the Ateles repository's own wording for the companion project", () => {
    expect(page).toContain(
      "operating system for humans and AI agents to jointly initiate, execute, approve, and"
    );
    expect(page).not.toContain("agentic organizations");
  });
});

describe("logo size rule and union outline", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
  const logos = read("frontend/src/components/onepager/NeotomaLogos.tsx");
  const onepager = read("frontend/src/components/onepager/NeotomaOnePager.tsx");
  const installPage = read("frontend/src/components/subpages/InstallPage.tsx");
  const brand = join(root, "frontend", "public", "brand");

  it("outlines the union of the shapes with an SVG filter, in the component and the static file", () => {
    const staticSvg = readFileSync(join(brand, "neotoma-lockup-drafting.svg"), "utf-8");
    const filterSource = readFileSync(join(dir, "neotoma_logo_drafting.generated.ts"), "utf-8");
    for (const markup of [staticSvg, filterSource]) {
      expect(markup).toMatch(/feMorphology/);
      expect(markup).toMatch(/"?operator"?(=|: )"dilate"/);
      expect(markup).toMatch(/"?operator"?(=|: )"out"/);
      expect(markup).toMatch(/feMerge/);
    }
    expect(readFileSync(join(brand, "neotoma-lockup-drafting.svg"), "utf-8")).toContain(
      'filter="url(#neotoma-drafting-edge)"'
    );
    // One filter per instance: ids come from useId, not a constant.
    expect(logos).toContain("useId()");
    expect(logos).not.toMatch(/id="neotoma-/);
    // The outline follows the theme through currentColor, and the paths carry no per-path stroke.
    expect(readFileSync(join(dir, "logo_filter.ts"), "utf-8")).toContain('ink: "currentColor"');
    expect(logos).not.toMatch(/stroke(Width)?=/);
  });

  it("uses the solid accepted lockup in the masthead, the footer and the /install chrome", () => {
    const mast = onepager.slice(
      onepager.indexOf('className="plan-masthead"'),
      onepager.indexOf('className="plan-masthead"') + 200
    );
    expect(mast).toContain("<SolidLockup");
    const footer = onepager.slice(onepager.indexOf('<footer className="plan-footer">'));
    expect(footer.slice(0, footer.indexOf("</footer>"))).toContain("<SolidLockup");
    const installMast = installPage.slice(installPage.indexOf('className="plan-install-masthead"'));
    expect(installMast.slice(0, installMast.indexOf("</nav>"))).toContain("<SolidLockup");
    expect(onepager + installPage).not.toContain("<DraftingLogo");
  });

  it("keeps the drafting logo small, in title blocks only, and only where its hairline renders cleanly", async () => {
    // Size: about 160 px wide, never above 170; no 280 px floor.
    // @ts-expect-error plain ESM script
    const script = await import("../../scripts/derive_neotoma_logo_drafting.mjs");
    expect(script.DRAFTING_WIDTH).toBe(160);
    expect(script.MAX_DRAFTING_WIDTH).toBeLessThanOrEqual(170);
    expect(read("scripts/derive_neotoma_logo_drafting.mjs")).not.toMatch(/280/);
    expect(logos).not.toMatch(/280/);
    expect(logos).toContain("Math.min(width, NEOTOMA_LOGO_EDGE.maxWidth)");
    // Hairline: about 0.5 CSS px, tint 6 to 8 percent.
    expect(script.EDGE_CSS_PX).toBeGreaterThanOrEqual(0.45);
    expect(script.EDGE_CSS_PX).toBeLessThanOrEqual(0.6);
    expect(script.TINT_OPACITY).toBeGreaterThanOrEqual(0.06);
    expect(script.TINT_OPACITY).toBeLessThanOrEqual(0.08);
    // The component scales the outline radius with the render width.
    expect(logos).toContain("NEOTOMA_LOGO_EDGE.edgePx");
    // The only DraftingLogo use is the title block, at the standard width; it has no height prop.
    const uses = [...logos.matchAll(/<DraftingLogo\s([^/>]*)\/>/g)].map((m) => m[1]);
    expect(uses.length).toBe(1);
    expect(uses[0]).toContain("width={NEOTOMA_LOGO_EDGE.width}");
    expect(logos).not.toMatch(/DraftingLogo\(\{\s*height/);
    // Chromium rounds the filter radius to whole device pixels, so on 1x displays (and phones) the
    // title block shows the solid lockup; the drafting variant needs 2x and a wide viewport.
    const css = read("frontend/src/components/onepager/onepager.css");
    expect(css).toMatch(/\.plan-tb-draft \{\s*display: none;/);
    expect(css).toMatch(
      /@media \(min-width: 861px\) and \(min-resolution: 2dppx\) \{\s*\.plan-tb-draft \{\s*display: block;/
    );
    // Text cells set the title block height: the logo cell has no vertical padding.
    expect(css).toMatch(/\.plan-titleblock \.plan-tb-logo \{[^}]*padding: 0 14px;/);
  });
});

describe("drafting filter has one description", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
  /** Reduce filter markup to its structure: tag, attributes (minus id, radius and flood-color values), order. */
  const structure = (markup: string) => {
    const filter = /<filter\b[\s\S]*?<\/filter>/.exec(markup)?.[0] ?? "";
    return [...filter.matchAll(/<(filter|fe\w+)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)].map((m) => {
      const attrs = [...m[2].matchAll(/([\w:-]+)="([^"]*)"/g)]
        .filter(([, name]) => name !== "id")
        .map(([, name, value]) =>
          name === "radius" || name === "flood-color" ? name : `${name}=${value}`
        )
        .sort();
      return `${m[1]} ${attrs.join(" ")}`;
    });
  };

  it("renders the same filter structure in the React component and the static SVG", async () => {
    // @ts-expect-error plain ESM script
    const script = await import("../../scripts/derive_neotoma_logo_drafting.mjs");
    const { logoFilter } = await import("../../frontend/src/components/onepager/logo_filter");
    const react = renderToStaticMarkup(
      createElement("svg", null, logoFilter("x", 0.947, script.TINT_OPACITY))
    );
    const stat = read("frontend/public/brand/neotoma-lockup-drafting.svg");
    const a = structure(react);
    const b = structure(stat);
    expect(a.length).toBeGreaterThan(8);
    expect(a).toEqual(b);
    // Values that must agree too: operator sequence and tint.
    expect(react).toContain(`flood-opacity="${script.TINT_OPACITY}"`);
    expect(stat).toContain(`flood-opacity="${script.TINT_OPACITY}"`);
  });

  it("does not hard-code filter primitives in the component", () => {
    const logos = read("frontend/src/components/onepager/NeotomaLogos.tsx");
    expect(logos).toContain("logoFilter(");
    expect(logos).not.toMatch(/<feMorphology|<feComposite|<feFlood|<feMerge/);
    expect(read("frontend/src/components/onepager/logo_filter.ts")).not.toMatch(
      /feMorphology|feComposite/
    );
  });
});

describe("/install polish", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
  const css = read("frontend/src/components/onepager/onepager.css");
  const install = read("frontend/src/components/install/install_page_body.tsx");

  it("keeps the install command block on single lines (no wrap inside claude-code)", () => {
    expect(install).toMatch(/plan-install-commands">\s*<CodeBlock\s+code=\{INSTALL_COMMANDS\}/);
    expect(css).toMatch(/\.plan-install-commands pre \{[^}]*white-space: pre !important;/);
  });

  it("gives the label chip a visible dot and the code blocks the drawing palette in both themes", () => {
    expect(css).toMatch(
      /span\.rounded-full\[class\*="emerald"\] \{\s*background-color: var\(--rust\) !important;/
    );
    expect(css).toMatch(
      /\.plan-install-sheet \.code-block-palette \{[^}]*background-image: none !important;[^}]*var\(--paper\)|\.plan-install-sheet \.code-block-palette \{[^}]*var\(--paper\) !important;[^}]*background-image: none !important;/
    );
  });

  it("has no stale 280 px drafting-logo comment", () => {
    expect(css).not.toMatch(/280 px/);
  });

  describe("claims fixes (re-check at the shipping commit)", () => {
    const readSrc = (rel: string) => readFileSync(join(root, rel), "utf-8");
    const page2 = files[0];
    const copy2 = files[1];

    it("lede reads as before and after, and does not claim who corrected it", () => {
      const lede = /plan-lede">([\s\S]*?)<\/p>/.exec(page2)![1].replace(/\s+/g, " ");
      expect(lede).toContain(
        "Without one, an agent works from whatever it happens to recall: part of the last session, a note its tool saved, or nothing."
      );
      expect(lede).not.toMatch(/last told|recalls only/i);
      expect(lede).toContain("With one, it reads what was stored, from which source, and what is current now");
      expect(lede).not.toMatch(/corrected/i);
      expect(lede).not.toMatch(/for example/i);
    });

    it("prints a corrections command that runs on the published package", () => {
      expect(copy2).toMatch(/neotoma corrections create ent_\w+ --entity-type invoice/);
    });

    it("does not say the run used a single build, and says ids vary", () => {
      expect(page2).not.toContain("uses the v0.25.0 build");
      expect(page2).toContain("differ on every run");
    });

    it("sheet 02 R1 does not say each fact is linked unqualified", () => {
      expect(copy2).toContain("Each stored fact as an observation linked to its source.");
    });

    it("keeps the Ateles line to what the companion project says of itself", () => {
      expect(page2).not.toContain("Neotoma answers what was true");
      expect(page2).not.toContain("Ateles answers");
    });

    it("lists no interactive command in the pasted install block", () => {
      const block = /INSTALL_COMMANDS = `([^`]*)`/.exec(copy2)![1];
      expect(block).not.toContain("neotoma mcp config");
      expect(page2).toContain("neotoma mcp config");
    });

    it("never says no telemetry without the npm update-check qualification", () => {
      const sources = [
        "frontend/src/components/onepager/NeotomaOnePager.tsx",
        "frontend/src/components/onepager/onepager_copy.ts",
        "frontend/src/components/install/install_page_body.tsx",
        "frontend/src/i18n/locales/install_page_strings.ts",
        "frontend/src/i18n/locales/static_packs.ts",
        "frontend/src/i18n/locales/home_body_en.ts",
        "frontend/src/site/seo_metadata.ts",
        "frontend/src/site/faq_items_en.ts",
        "frontend/src/site/site_data.ts",
        "inspector/src/lib/faq_preview.ts",
      ];
      let seen = 0;
      for (const rel of sources) {
        const text = readSrc(rel);
        // The localized install packs (subpage_packs.ts) are deliberately absent: those routes are redirect stubs.
        for (const m of text.matchAll(/no (?:remote |opt-out )?telemetry|phone-home/gi)) {
          seen++;
          const after = text.slice(m.index!, m.index! + 600);
          expect(/npm registry|npm update checks/i.test(after), `${rel}: ${m[0]}`).toBe(true);
          expect(/NO_UPDATE_NOTIFIER=1/.test(after), `${rel}: ${m[0]}`).toBe(true);
          expect(/when a session starts/i.test(after), `${rel}: ${m[0]} names only part of the update checks`).toBe(true);
          expect(/connection metadata/i.test(after), `${rel}: ${m[0]} omits what the registry sees`).toBe(true);
        }
      }
      expect(seen).toBeGreaterThanOrEqual(4);
      const en = readSrc("frontend/src/i18n/locales/install_page_strings.ts");
      for (const fragment of [
        "checks the npm registry for a newer version about once a day",
        "The stdio MCP server checks when a session starts and about every 6 hours after",
        "--no-update-check applies to the CLI only",
        "The request carries only the package name, and the registry sees ordinary connection metadata such as the address.",
      ]) {
        expect(en, fragment).toContain(fragment);
      }
    });

    it("says OpenCode uses a plugin or MCP", () => {
      expect(copy2).toContain("OpenCode uses a plugin or MCP");
    });

    it("install page: no unevidenced reversibility, 5-minute, or telemetry-absolute claims", () => {
      const strings = readSrc("frontend/src/i18n/locales/install_page_strings.ts");
      const en = strings.slice(strings.indexOf("export const INSTALL_PAGE_EN"), strings.indexOf("export const INSTALL_PAGE_ES"));
      expect(en.length).toBeGreaterThan(500);
      expect(en).not.toContain("5-minute integration");
      expect(en).not.toContain("phone-home");
      expect(en).not.toContain("reconstruct a timeline");
      expect(en).not.toContain("activate Neotoma with your data");
      expect(en).toContain("NO_UPDATE_NOTIFIER=1");
      expect(en).toContain("only when run from inside a Neotoma repository");
      const body = readSrc("frontend/src/components/install/install_page_body.tsx");
      expect(body).not.toContain("fullyReversible");
      const data = readSrc("frontend/src/site/site_data.ts");
      expect(data).not.toContain("activate Neotoma with my data");
    });
  });
});


/**
 * The held /evaluate page: /install sends agents there, so its headline (title, description) and the
 * first screen (lede plus the "What Neotoma does for you" section) carry the current category and no
 * retired frame or omitted claim. The rest of the page is held for its owner and is not checked here.
 * Revert-check: put "replayable" or "deterministic state layer" back into introP1 or the /evaluate
 * metadata and these go red; scripts/validate_site_export.ts repeats the check on the built HTML.
 */
describe("/evaluate headline and first screen", () => {
  const meta = resolveSeoMetadata("/evaluate");
  const en = EVALUATE_SUBPAGE_EN;
  const firstScreen = (e: typeof en) => [e.introP1, e.introP2BeforeLink, e.whatNeotomaP1, e.whatNeotomaP2];
  const retired: [RegExp, string][] = [
    [/deterministic state|state layer|memory layer/i, "retired category noun"],
    [/replay/i, "replay"],
    [/pick up where|retomen donde/i, "pick up where they left off"],
    [/corrections? (always|will always) wins?|correction sticks everywhere/i, "corrections always win"],
    [/append-only/i, "database-enforced append-only"],
    [/export(s|ed)? (with|including) (full )?history/i, "export with history"],
  ];

  it("names the category and the lede line in the title, description and lede", () => {
    expect(meta.title).toContain("system of record for AI agents");
    expect(meta.description).toContain("A record, not recall.");
    expect(en.introP1.startsWith("A record, not recall. Neotoma is the system of record for AI agents.")).toBe(true);
    expect(EVALUATE_SUBPAGE_ES.introP1).toContain("sistema de registro para agentes de IA");
  });

  it("carries no retired phrase or omitted claim in the headline or first screen, in either locale", () => {
    const texts = [meta.title, meta.description, ...firstScreen(en), ...firstScreen(EVALUATE_SUBPAGE_ES)];
    for (const [re, label] of retired) {
      for (const text of texts) {
        expect(re.test(text), `${label}: ${text.slice(0, 80)}`).toBe(false);
      }
    }
  });
});

/**
 * No "developer preview" label on any public page (operator ruling 2026-10-20). The label lived in the
 * header badge of the old app shell (which every held page uses), in the dictionaries, and in the FAQ
 * answer "Is this production-ready?". Revert-check: put the dictionary key, the badge or the phrase
 * back and these go red; scripts/validate_site_export.ts repeats the check on the built pages.
 */
describe("no developer-preview label", () => {
  const read = (...p: string[]) => readFileSync(join(root, ...p), "utf-8");
  it("is gone from the header shell, the dictionaries and the FAQ copy", () => {
    const sources = {
      "SiteHeaderNav.tsx": read("frontend", "src", "components", "SiteHeaderNav.tsx"),
      "dictionaries.ts": read("frontend", "src", "i18n", "dictionaries.ts"),
      "home_body_en.ts": read("frontend", "src", "i18n", "locales", "home_body_en.ts"),
      "home_body_es.ts": read("frontend", "src", "i18n", "locales", "home_body_es.ts"),
      "faq_preview.ts": read("inspector", "src", "lib", "faq_preview.ts"),
    };
    for (const [name, text] of Object.entries(sources)) {
      expect(text, name).not.toMatch(/developer preview|developerPreview|vista previa para desarrolladores/i);
    }
  });
  it("is absent from the JSON-LD and metadata of the live routes", () => {
    for (const route of LIVE_ROUTES) {
      const meta = resolveSeoMetadata(route);
      const all = JSON.stringify([meta.title, meta.description, meta.jsonLd]);
      expect(all, route).not.toMatch(/developer preview/i);
    }
  });
});
