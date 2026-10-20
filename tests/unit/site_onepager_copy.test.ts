import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
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
});

describe("sheet 01 plate (FIG. A-1)", () => {
  const read = (rel: string) => readFileSync(join(root, rel), "utf-8");
  const brand = join(root, "frontend", "public", "brand");
  const prov = JSON.parse(readFileSync(join(brand, "PROVENANCE.json"), "utf-8")).plate as {
    source: { sha256: string };
    files: Record<string, { sha256: string; bytes: number; width: number; height: number }>;
  };
  const html = renderToStaticMarkup(RecordPlate());
  const attr = (tag: string, name: string) =>
    new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
  const img = /<img\b[^>]*>/.exec(html)![0];

  it("keeps the committed plate files byte for byte (sha256, size and dimensions from PROVENANCE.json)", async () => {
    expect(Object.keys(prov.files).length).toBe(4);
    for (const [file, info] of Object.entries(prov.files)) {
      const bytes = readFileSync(join(brand, file));
      expect(createHash("sha256").update(bytes).digest("hex"), file).toBe(info.sha256);
      expect(bytes.length, `${file} bytes`).toBe(info.bytes);
      const meta = await sharp(bytes).metadata();
      expect([meta.width, meta.height], `${file} dimensions`).toEqual([info.width, info.height]);
    }
  });

  it("records the accepted source hash and refuses any other source", async () => {
    // @ts-expect-error plain ESM script
    const script = await import("../../scripts/derive_neotoma_plate.mjs");
    expect(prov.source.sha256).toBe(script.ACCEPTED_SOURCE_SHA256);
    expect(() => script.verifySource(Buffer.from("not the accepted photograph"))).toThrow(
      /refusing to derive/
    );
    // The narrow files are a crop window of the source frame; the overlay must use the same window.
    const { NARROW_VIEW, PLATE_NARROW } =
      await import("../../frontend/src/components/onepager/onepager_plate");
    expect(NARROW_VIEW).toEqual({
      x: script.NARROW_CROP.left,
      y: script.NARROW_CROP.top,
      w: script.NARROW_CROP.width,
      h: script.NARROW_CROP.height,
    });
    expect([PLATE_NARROW.width, PLATE_NARROW.height]).toEqual([
      script.NARROW_SIZE.width,
      script.NARROW_SIZE.height,
    ]);
  });

  it("gives the image a text alternative and explicit dimensions that match the file", () => {
    const alt = attr(img, "alt");
    expect(alt && alt.length, "alt text").toBeGreaterThan(120);
    expect(alt).toMatch(/synthetic example/i);
    const wide = prov.files["plate/neotoma-plate-a1-wide.jpg"];
    expect(Number(attr(img, "width"))).toBe(wide.width);
    expect(Number(attr(img, "height"))).toBe(wide.height);
    expect(attr(img, "src")).toBe("/brand/plate/neotoma-plate-a1-wide.jpg");
    // Both file families carry their own dimensions on the <source> so the box is reserved either way.
    const sources = [...html.matchAll(/<source\b[^>]*>/g)].map((m) => m[0]);
    expect(sources.length).toBe(3);
    for (const tag of sources) {
      const file = attr(tag, "srcset")!.replace("/brand/", "");
      const info = prov.files[file];
      expect(info, file).toBeDefined();
      expect(Number(attr(tag, "width")), file).toBe(info.width);
      expect(Number(attr(tag, "height")), file).toBe(info.height);
    }
  });

  it("serves a separate narrow crop at 860 px and below, and never lazy-loads the first-screen image", () => {
    const narrow = [...html.matchAll(/<source\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((t) => attr(t, "media") === "(max-width: 860px)");
    expect(narrow.map((t) => attr(t, "srcset"))).toEqual([
      "/brand/plate/neotoma-plate-a1-narrow.webp",
      "/brand/plate/neotoma-plate-a1-narrow.jpg",
    ]);
    expect(img).not.toMatch(/loading="lazy"/);
    expect(img).toMatch(/fetchpriority="high"/);
  });

  it("keeps the desktop file light (WebP at most 120 KB)", () => {
    const wide = prov.files["plate/neotoma-plate-a1-wide.webp"];
    expect(wide.bytes).toBeLessThanOrEqual(120 * 1024);
    expect(prov.files["plate/neotoma-plate-a1-narrow.webp"].bytes).toBeLessThan(wide.bytes);
  });

  it("puts no words on the paper objects: the overlay text is only keys, labels and the note", () => {
    const text = [...html.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&#x27;|&amp;/g, "")
        .trim()
    );
    const allowed = [/^[1-4]$/, /^FIG\. A-1/, /^SYNTHETIC EXAMPLE$/, /^NOTE$/, /^[A-Z0-9 .,]+$/];
    for (const t of text) {
      expect(
        allowed.some((re) => re.test(t)),
        `unexpected overlay text: ${t}`
      ).toBe(true);
    }
    expect(text.filter((t) => /^[1-4]$/.test(t)).length).toBe(8); // four keys, wide and narrow
    // No invoice data (dates, amounts) is drawn on the plate; the legend carries it.
    expect(text.join(" ")).not.toMatch(/OCT|3,?200|3,?250/);
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2);
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
  });

  it("replaces the abstract record plan in sheet 01 and keeps the four-item legend", () => {
    const page = files[0];
    expect(page).toContain("<RecordPlate />");
    expect(page).not.toContain("RecordPlan");
    expect(files[2]).not.toContain("RecordPlan");
    expect(page).toContain("FIGURE_LEGEND.map");
    expect(/FIGURE_LEGEND[^=]*= \[([\s\S]*?)\n\];/.exec(files[1])![1].split('",\n').length).toBe(4);
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

