import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { RecordPlate } from "../../frontend/src/components/onepager/onepager_plate";

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
const all = [...files, readFileSync(join(dir, "onepager_plate.tsx"), "utf-8")]
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

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
      expect(lede).toContain("Without one, an agent recalls only what it was last told.");
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

describe("sheet 01 plate (FIG. A-1)", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
  const brand = join(root, "frontend", "public", "brand");
  type FileInfo = { sha256: string; bytes: number; width: number; height: number };
  const prov = JSON.parse(readFileSync(join(brand, "PROVENANCE.json"), "utf-8")).plate as {
    identity: string;
    derived_from_hero: boolean;
    hero: { sha256: string };
    generation: {
      outputs: Record<string, { sha256: string }>;
      credits: { exploration_total: number };
    };
    preparation: { frames: Record<string, { sha256: string; width: number; height: number }> };
    layout: { wide_sha256: string; narrow_sha256: string };
    files: Record<string, FileInfo>;
    superseded: string;
  };
  const html = renderToStaticMarkup(RecordPlate());
  const attr = (tag: string, name: string) =>
    new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
  const img = /<img\b[^>]*>/.exec(html)![0];
  const base = "plate/neotoma-plate-a1-r2-";
  const FILES = ["narrow.jpg", "narrow.webp", "wide.jpg", "wide.webp"].map((f) => base + f);
  const copyConst = (name: string) =>
    new RegExp(`${name} =\\s*"([^"]*)"`).exec(files[1])?.[1] ?? "";
  const legendItems = () => {
    const legend = /FIGURE_LEGEND[^=]*= \[([\s\S]*?)\n\];/.exec(files[1])![1];
    return [...legend.matchAll(/^ {2}"(.*)",$/gm)].map((m) => m[1]);
  };
  const noteLines = () => {
    const note = /PLATE_NOTE[^=]*= \[([\s\S]*?)\n\];/.exec(files[1])![1];
    return [...note.matchAll(/^ {2}"(.*)",$/gm)].map((m) => m[1]);
  };

  it("keeps the committed plate files byte for byte (sha256, size and dimensions from PROVENANCE.json)", async () => {
    expect(Object.keys(prov.files).sort()).toEqual(FILES);
    for (const [file, info] of Object.entries(prov.files)) {
      const bytes = readFileSync(join(brand, file));
      expect(createHash("sha256").update(bytes).digest("hex"), file).toBe(info.sha256);
      expect(bytes.length, `${file} bytes`).toBe(info.bytes);
      const meta = await sharp(bytes).metadata();
      expect(meta.format, file).toBe(file.endsWith(".webp") ? "webp" : "jpeg");
      expect([meta.width, meta.height], `${file} dimensions`).toEqual([info.width, info.height]);
    }
  });

  it("ships image data only: no metadata, text, animation chunks or trailing bytes in any plate file", () => {
    for (const file of FILES) {
      const b = readFileSync(join(brand, file));
      if (file.endsWith(".webp")) {
        expect(b.toString("latin1", 0, 4), file).toBe("RIFF");
        expect(b.toString("latin1", 8, 12), file).toBe("WEBP");
        expect(b.readUInt32LE(4) + 8, `${file}: RIFF size covers the whole file`).toBe(b.length);
        const chunks: string[] = [];
        for (let i = 12; i < b.length; ) {
          const size = b.readUInt32LE(i + 4);
          chunks.push(b.toString("latin1", i, i + 4));
          i += 8 + size + (size & 1);
          expect(i, `${file}: chunk runs past the end`).toBeLessThanOrEqual(b.length);
        }
        // A single lossy or lossless bitstream; no VP8X, EXIF, XMP, ICCP, ANIM or ANMF.
        expect(chunks, file).toHaveLength(1);
        expect(["VP8 ", "VP8L"], file).toContain(chunks[0]);
      } else {
        expect([b[0], b[1]], `${file}: SOI`).toEqual([0xff, 0xd8]);
        expect([b[b.length - 2], b[b.length - 1]], `${file}: ends at EOI`).toEqual([0xff, 0xd9]);
        const markers: number[] = [];
        let sos = -1;
        for (let i = 2; i < b.length; ) {
          expect(b[i], `${file}: marker`).toBe(0xff);
          const m = b[i + 1];
          markers.push(m);
          if (m === 0xda) {
            sos = i; // entropy-coded data follows
            break;
          }
          i += 2 + b.readUInt16BE(i + 2);
        }
        expect(sos, `${file}: SOS`).toBeGreaterThan(0);
        // No APPn (EXIF, XMP, ICC, Photoshop) and no comment segments.
        expect(
          markers.filter((m) => (m >= 0xe0 && m <= 0xef) || m === 0xfe),
          file
        ).toEqual([]);
        // EOI appears once, at the very end: nothing is appended after the image.
        expect(b.indexOf(Buffer.from([0xff, 0xd9]), sos), file).toBe(b.length - 2);
      }
    }
  });

  it("records the plate as a generated illustration derived from the accepted hero, and the script refuses any other frame", async () => {
    // @ts-expect-error plain ESM script
    const script = await import("../../scripts/derive_neotoma_plate.mjs");
    expect(prov.derived_from_hero).toBe(true);
    expect(prov.identity).toMatch(/generated illustration/);
    expect(prov.superseded).toMatch(/superseded before merge and never shipped/);
    expect(prov.hero.sha256).toBe(script.ACCEPTED_HERO_SHA256);
    for (const out of Object.values(prov.generation.outputs))
      expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prov.generation.credits.exploration_total).toBe(86);
    expect(script.FRAMES.wide.sha256).toBe(prov.preparation.frames.wide.sha256);
    expect(script.FRAMES.narrow.sha256).toBe(prov.preparation.frames.narrow.sha256);
    expect(() => script.verifyFrame("wide", Buffer.from("not the prepared frame"))).toThrow(
      /refusing to derive/
    );
  });

  it("pins each frame's size and object boxes to the hash the images were registered against", async () => {
    // @ts-expect-error plain ESM script
    const script = await import("../../scripts/derive_neotoma_plate.mjs");
    const { PLATE_WIDE_LAYOUT, PLATE_NARROW_LAYOUT } =
      await import("../../frontend/src/components/onepager/plate_layout");
    const hash = (f: typeof PLATE_WIDE_LAYOUT) =>
      createHash("sha256")
        .update(JSON.stringify({ width: f.width, height: f.height, objects: f.objects }))
        .digest("hex");
    expect(hash(PLATE_WIDE_LAYOUT)).toBe(prov.layout.wide_sha256);
    expect(hash(PLATE_NARROW_LAYOUT)).toBe(prov.layout.narrow_sha256);
    for (const [layout, frame] of [
      [PLATE_WIDE_LAYOUT, script.FRAMES.wide],
      [PLATE_NARROW_LAYOUT, script.FRAMES.narrow],
    ] as const) {
      expect([layout.width, layout.height]).toEqual([frame.width, frame.height]);
      for (const ext of ["webp", "jpg"]) {
        const info = prov.files[`plate/${frame.out}.${ext}`];
        expect([layout.width, layout.height]).toEqual([info.width, info.height]);
      }
    }
  });

  it("lands every callout on what it touches: connector and leader ends at object edges, keys on their lines", async () => {
    const { PLATE_WIDE_LAYOUT, PLATE_NARROW_LAYOUT } =
      await import("../../frontend/src/components/onepager/plate_layout");
    type Box = { x: number; y: number; w: number; h: number };
    // Distance from a point to a box's outline (0 on the edge).
    const toEdge = ([px, py]: readonly [number, number], b: Box) => {
      const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
      const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
      const outside = Math.hypot(dx, dy);
      if (outside > 0) return outside;
      return Math.min(px - b.x, b.x + b.w - px, py - b.y, b.y + b.h - py);
    };
    const toPolyline = ([px, py]: readonly [number, number], pts: readonly (readonly [number, number])[]) => {
      let best = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const L2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2)) : 0;
        best = Math.min(best, Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
      }
      return best;
    };
    for (const f of [PLATE_WIDE_LAYOUT, PLATE_NARROW_LAYOUT]) {
      const u = f.width / f.displayWidth;
      const box = (t: string) => (t === "cloud" ? f.cloud : f.objects[t as keyof typeof f.objects]);
      const check = (label: string, p: readonly [number, number], t: string | null) => {
        if (t === null) return;
        // A printed connector stops 12 units short of the paper (its end bar or arrow tip).
        expect(toEdge(p, box(t)), `${label} touching ${t}`).toBeLessThanOrEqual(14);
      };
      f.connectors.forEach((c, i) => {
        check(`${f.width} connector ${i} start`, c.points[0], c.touches[0]);
        check(`${f.width} connector ${i} end`, c.points[c.points.length - 1], c.touches[1]);
      });
      f.leaders.forEach((l, i) => {
        check(`${f.width} leader ${i} start`, l.points[0], l.touches[0]);
        check(`${f.width} leader ${i} end`, l.points[l.points.length - 1], l.touches[1]);
      });
      // Key 2's leader starts in the punched slot, inside the rule card.
      expect(f.leaders[0].points[0]).toEqual(f.ruleTarget);
      expect(toEdge(f.ruleTarget, f.objects.rule)).toBeGreaterThan(0);
      const r = 11 * u;
      for (const k of f.keys) {
        const [kind, i] = k.on;
        const line =
          kind === "dim"
            ? [f.dims[i].from, f.dims[i].to]
            : kind === "leader"
              ? f.leaders[i].points
              : f.connectors[i].points;
        expect(toPolyline(k.at, line), `${f.width} key ${k.n} sits on its line`).toBeLessThanOrEqual(r + 1);
      }
    }
  });

  it("gives the image a short text alternative that says it is a generated illustration and does not repeat the legend", () => {
    const alt = attr(img, "alt")!;
    expect(alt.length, "alt text length").toBeGreaterThan(150);
    expect(alt.length, "alt text length").toBeLessThanOrEqual(280);
    expect(alt).toMatch(/synthetic example/i);
    expect(alt).toMatch(/generated illustration/);
    expect(alt).not.toMatch(/photograph/i);
    expect(alt).toMatch(/explained in the legend below/);
    // The legend is HTML right below and is read in full; the alternative does not restate it.
    for (const item of legendItems()) expect(alt, item).not.toContain(item.slice(0, 30));
    expect(alt).not.toMatch(/October|last write|revision cloud|MCP|client/i);
  });

  it("serves WebP with a JPEG fallback for each frame, the phone frame at 860 px and below, never lazy", () => {
    const sources = [...html.matchAll(/<source\b[^>]*>/g)].map((m) => m[0]);
    expect(
      sources.map((t) => [attr(t, "media") ?? null, attr(t, "type"), attr(t, "srcset")])
    ).toEqual([
      ["(max-width: 860px)", "image/webp", `/brand/${base}narrow.webp`],
      ["(max-width: 860px)", "image/jpeg", `/brand/${base}narrow.jpg`],
      [null, "image/webp", `/brand/${base}wide.webp`],
    ]);
    for (const tag of sources) {
      const info = prov.files[attr(tag, "srcset")!.replace("/brand/", "")];
      expect(Number(attr(tag, "width"))).toBe(info.width);
      expect(Number(attr(tag, "height"))).toBe(info.height);
    }
    expect(attr(img, "src")).toBe(`/brand/${base}wide.jpg`);
    const wide = prov.files[`${base}wide.jpg`];
    expect(Number(attr(img, "width"))).toBe(wide.width);
    expect(Number(attr(img, "height"))).toBe(wide.height);
    expect(img).not.toMatch(/loading="lazy"/);
    expect(img).toMatch(/fetchpriority="high"/);
  });

  it("pins the responsive plate CSS: phone frame, phone callouts on, desktop callouts off at 860 px", () => {
    const css = read("frontend/src/components/onepager/onepager.css");
    const blocks: string[] = [];
    for (const m of css.matchAll(/@media \(max-width: 860px\) \{/g)) {
      let depth = 0;
      let i = m.index! + m[0].length - 1;
      const start = i;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        if (css[i] === "}" && --depth === 0) break;
      }
      blocks.push(css.slice(start, i));
    }
    const plateBlock = blocks.find((b) => b.includes(".plan-plate-overlay-narrow")) ?? "";
    expect(plateBlock).toMatch(/\.plan-plate \{[^}]*aspect-ratio: 800 \/ 1200;/);
    expect(plateBlock).toMatch(/\.plan-plate-overlay-narrow \{\s*display: block;\s*\}/);
    expect(plateBlock).toMatch(/\.plan-plate-overlay-wide \{\s*display: none;\s*\}/);
    // Outside the media query the phone callouts are hidden.
    expect(css).toMatch(/\n\.plan-plate-overlay-narrow \{\s*display: none;\s*\}/);
    // The plate box zeroes line-height; the image restores it so the alt text is not clipped.
    expect(/\.plan-plate-img \{[^}]*\}/.exec(css)![0]).toMatch(/line-height: 1\.4;/);
  });

  it("keeps both files light (each at most 60 KB)", () => {
    for (const file of FILES) expect(prov.files[file].bytes, file).toBeLessThanOrEqual(60 * 1024);
  });

  it("puts no words on the paper objects: the overlay text is only keys, labels and the note", () => {
    const text = [...html.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&#x27;|&amp;/g, "")
        .trim()
    );
    const allowed = [/^[1-5]$/, /^FIG\. A-1/, /^SYNTHETIC EXAMPLE$/, /^NOTE$/, /^[A-Z0-9 .,]+$/];
    for (const t of text) {
      expect(
        allowed.some((re) => re.test(t)),
        `unexpected overlay text: ${t}`
      ).toBe(true);
    }
    // Six keys per frame (1 to 4 once, 5 at the write and at the read), two frames.
    expect(text.filter((t) => /^[1-5]$/.test(t)).length).toBe(12);
    expect(text.filter((t) => t === "5").length).toBe(4);
    expect(text.join(" ")).toContain("KEYS 1 TO 5 MATCH THE LEGEND.");
    // No invoice data (dates, amounts) is drawn on the plate; the legend carries it.
    expect(text.join(" ")).not.toMatch(/OCT|3,?200|3,?250/);
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2);
  });

  it("draws write and read direction only in the callout layer, with key 5 at each", async () => {
    const { PLATE_WIDE_LAYOUT, PLATE_NARROW_LAYOUT } =
      await import("../../frontend/src/components/onepager/plate_layout");
    for (const f of [PLATE_WIDE_LAYOUT, PLATE_NARROW_LAYOUT]) {
      // Two writes (source to observation) and one read (out of the record card).
      const arrows = f.connectors.filter((c) => c.arrow);
      expect(arrows.map((c) => c.touches)).toEqual([
        ["pdf", "obs1"],
        ["email", "obs2"],
        ["snap", null],
      ]);
      expect(f.keys.filter((k) => k.n === 5).length).toBe(2);
      expect(new Set(f.keys.map((k) => k.n))).toEqual(new Set([1, 2, 3, 4, 5]));
      // Every key and arrow tip sits inside its frame with room to spare, and no two keys overlap.
      const r = 11 * (f.width / f.displayWidth);
      const margin = 10 * (f.width / f.displayWidth); // 10 CSS px
      for (const k of f.keys) {
        expect(k.at[0] - r, `key ${k.n}`).toBeGreaterThanOrEqual(0);
        expect(k.at[0] + r, `key ${k.n}`).toBeLessThanOrEqual(f.width);
        expect(k.at[1] - r, `key ${k.n}`).toBeGreaterThanOrEqual(0);
        expect(k.at[1] + r, `key ${k.n}`).toBeLessThanOrEqual(f.height);
      }
      for (const c of arrows) {
        const [x, y] = c.points[c.points.length - 1];
        expect(Math.min(x, f.width - x, y, f.height - y), "arrow tip room").toBeGreaterThanOrEqual(margin);
      }
      for (let i = 0; i < f.keys.length; i++) {
        for (let j = i + 1; j < f.keys.length; j++) {
          const d = Math.hypot(
            f.keys[i].at[0] - f.keys[j].at[0],
            f.keys[i].at[1] - f.keys[j].at[1]
          );
          expect(d, `keys ${f.keys[i].n} and ${f.keys[j].n}`).toBeGreaterThan(2 * r);
        }
      }
      // The note type stays readable at the size the frame is drawn at, and fits its box
      // (monospace advance taken as 0.6 em; at least 4 CSS px to spare). The phone frame puts
      // one note entry per line, the desktop frame joins them on one line.
      expect(f.note.size).toBeGreaterThanOrEqual(11);
      const u = f.width / f.displayWidth;
      const lines = f.width === 800 ? noteLines() : [noteLines().join(" ")];
      const inset = f.width === 800 ? 6 : 12;
      for (const line of lines) {
        const need = (f.note.cell + inset + line.length * 0.6 * f.note.size + 4) * u;
        expect(need, `note line fits: ${line}`).toBeLessThanOrEqual(f.note.x1 - f.note.x0);
      }
    }
  });

  it("keeps the plate's own paper ground in dark mode: framed, never inverted or tinted", () => {
    const css = read("frontend/src/components/onepager/onepager.css");
    const rule = (sel: string) =>
      new RegExp(`${sel.replace(/[.]/g, "\\.")} \\{[^}]*\\}`).exec(css)?.[0] ?? "";
    expect(rule(".dark .plan-plate")).toMatch(/border-color: rgba\(236, 229, 212/);
    for (const sel of [".plan-plate", ".plan-plate-img", ".dark .plan-plate"]) {
      expect(rule(sel), sel).not.toMatch(/filter|invert|mix-blend|opacity/);
    }
    expect(css).not.toMatch(/\.dark[^{]*\.plan-plate-img/);
    // The image is a generated illustration; the CSS does not call it a photograph.
    expect(css).not.toMatch(/photograph/i);
  });

  it("keeps the four legend items word for word and adds item 5 with the MCP-only, self-reported attribution limit", () => {
    const page = files[0];
    expect(page).toContain("<RecordPlate />");
    expect(page).not.toContain("RecordPlan");
    expect(files[2]).not.toContain("RecordPlan");
    expect(page).toContain("FIGURE_LEGEND.map");
    const items = legendItems();
    expect(items.length).toBe(5);
    expect(items[0]).toBe(
      "Two sources say different things about one invoice: the PDF says due 22 October, a later email says 29 October."
    );
    expect(items[3]).toBe(
      "The amount still comes from the first observation. Both observations stay on record."
    );
    expect(items[4]).toBe(
      "Agents write each source in as an observation, and read the current snapshot back out. Writes made through the MCP server also record the client name the client reports."
    );
    // Every piece of plate text: attribution only for MCP writes, only as the client's own report.
    const plateText = [
      items[4],
      copyConst("PLATE_ALT"),
      copyConst("PLATE_CAPTION"),
      ...noteLines(),
    ];
    expect(plateText.every((t) => t.length > 0)).toBe(true);
    for (const t of plateText) {
      expect(t, t).not.toMatch(/(every|all|each) writes?[^.]*(record|attribut)/i);
      expect(t, t).not.toMatch(/(REST|CLI)[^.]*(record|attribut)/i);
      expect(t, t).not.toMatch(/(verified|authenticated|proven) (client|identity|author)/i);
      if (/client/i.test(t)) expect(t, t).toContain("the client name the client reports");
    }
    expect(page).toContain("{PLATE_CAPTION}");
    expect(copyConst("PLATE_CAPTION")).toBe(
      "Synthetic example: agents write two sources in and read one current record out. The same flow is run for real in sheet 03."
    );
  });
});

describe("/install code blocks (round 3)", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
  const css = read("frontend/src/components/onepager/onepager.css");
  const body = read("frontend/src/components/install/install_page_body.tsx");

  it("gives every pre on the install sheet the drawing palette, not the global teal gradient", () => {
    expect(css).toMatch(
      /\.plan-install-sheet pre \{[^}]*background: var\(--paper\) !important;[^}]*background-image: none !important;[^}]*border-color: var\(--line\) !important;/,
    );
  });

  it("keeps the permissions snippet on single lines and focusable", () => {
    expect(css).toMatch(/\.plan-install-preflight pre \{[^}]*white-space: pre !important;/);
    expect(body).toContain('className="plan-install-preflight');
    const pf = read("frontend/src/components/PermissionsPreflight.tsx");
    expect(pf).toMatch(/<pre\s+tabIndex=\{0\}\s+role="region"\s+aria-label="Permissions pre-flight snippet/);
  });

  it("makes the clipped install block a labelled, focusable region with an edge cue", () => {
    expect(body).toMatch(/scrollLabel="Install commands\./);
    const block = read("frontend/src/components/InstallCodeBlock.tsx");
    expect(block).toContain('tabIndex: 0, role: "region", "aria-label": scrollLabel');
    expect(css).toMatch(/background-attachment: local, local, scroll, scroll !important;/);
  });
});

