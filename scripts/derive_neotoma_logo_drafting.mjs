#!/usr/bin/env node
/**
 * Derives the drafting-style Neotoma logo variant from the ACCEPTED lockup, without redrawing it.
 *
 * Source (accepted, operator-selected 2026-10-06, "Retained sheets" symbol + N2 wordmark):
 *   frontend/public/brand/n2-nav-light.svg  (see frontend/public/brand/PROVENANCE.json)
 * Derivation: every <g> transform and every <path> transform and `d` is copied byte for byte.
 * Only the paint changes: the paths keep the ink fill and an SVG filter outlines the UNION of the
 * shapes (dilate, subtract the shapes, flood with ink) with a faint ink tint inside. Per-path
 * strokes are not used because they draw the overlaps between shapes. No geometry is added,
 * moved, simplified or re-traced. Tuned for a 160 px render on a 2x display: Chromium rounds the
 * filter radius to whole device pixels, so on a 1x display the hairline cannot be drawn and the
 * page shows the solid lockup there instead (see onepager.css).
 * Outputs:
 *   frontend/public/brand/neotoma-lockup-drafting.svg                 (static file, stroke #172b39)
 *   frontend/src/components/onepager/neotoma_logo_drafting.generated.ts (data for the inline component)
 * Run: node scripts/derive_neotoma_logo_drafting.mjs   (CI test re-derives and compares)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "frontend/public/brand/n2-nav-light.svg");

export function parseLockup(svg) {
  const head = /<svg\s+([^>]*)>/.exec(svg);
  const viewBox = /viewBox="([^"]+)"/.exec(head[1])[1];
  const width = /width="([^"]+)"/.exec(head[1])[1];
  const height = /height="([^"]+)"/.exec(head[1])[1];
  const groups = [];
  const gRe = /<g transform="([^"]+)">([\s\S]*?)<\/g>/g;
  let g;
  while ((g = gRe.exec(svg)) !== null) {
    const paths = [];
    const pRe = /<path\s+([^>]*?)\/>/g;
    let p;
    while ((p = pRe.exec(g[2])) !== null) {
      const attrs = p[1];
      paths.push({
        transform: /transform="([^"]+)"/.exec(attrs)?.[1] ?? null,
        d: /\sd="([^"]+)"/.exec(" " + attrs)[1],
      });
    }
    groups.push({ transform: g[1], paths });
  }
  return { viewBox, width, height, groups };
}

/** Refuses a source file whose sha256 differs from the accepted hash recorded in PROVENANCE.json. */
export function verifySource(svgText, provenance, name = "n2-nav-light.svg") {
  const expected = provenance.files?.[name]?.sha256;
  if (!expected) throw new Error(`PROVENANCE.json records no sha256 for ${name}`);
  const actual = crypto.createHash("sha256").update(svgText).digest("hex");
  if (actual !== expected) {
    throw new Error(`${name} does not match the accepted logo (sha256 ${actual} != ${expected}); refusing to derive`);
  }
}

/** Render width of the drafting lockup in a sheet title block, in CSS px. */
export const DRAFTING_WIDTH = 160;
/** The component clamps the render width to this cap, so the logo never dominates the title block. */
export const MAX_DRAFTING_WIDTH = 170;
/** Outline width in CSS px: a hairline (one device pixel on a 2x display). */
export const EDGE_CSS_PX = 0.5;
/** The accepted lockup's viewBox width. Outline radius in viewBox units = EDGE_CSS_PX * VIEWBOX_WIDTH / render width. */
export const VIEWBOX_WIDTH = 303.128;
export const EDGE_RADIUS = Math.round((EDGE_CSS_PX * VIEWBOX_WIDTH * 1000) / DRAFTING_WIDTH) / 1000;
/** Opacity of the ink tint inside the outline (blueprint feel). */
export const TINT_OPACITY = 0.07;

/** SVG filter that outlines the UNION of the filled shapes: dilate, subtract the shapes, flood with ink. */
export function edgeFilter(id, color = "#172b39") {
  return (
    `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${EDGE_RADIUS}" result="d"/>` +
    `<feComposite in="d" in2="SourceAlpha" operator="out" result="edge"/>` +
    `<feFlood flood-color="${color}" result="ink"/>` +
    `<feComposite in="ink" in2="edge" operator="in" result="line"/>` +
    `<feFlood flood-color="${color}" flood-opacity="${TINT_OPACITY}" result="t"/>` +
    `<feComposite in="t" in2="SourceAlpha" operator="in" result="tin"/>` +
    `<feMerge><feMergeNode in="tin"/><feMergeNode in="line"/></feMerge>` +
    `</filter>`
  );
}

export function buildOutputs(svg) {
  const lockup = parseLockup(svg);
  const raw = (svg.match(/<path\b/g) || []).length;
  const parsed = lockup.groups.reduce((n, g) => n + g.paths.length, 0);
  if (raw !== parsed) {
    throw new Error(`parser read ${parsed} of ${raw} <path> elements; refusing to derive a partial logo`);
  }
  const attr = (path) => `${path.transform ? ` transform="${path.transform}"` : ""} d="${path.d}"`;
  const body = lockup.groups
    .map(
      (grp) =>
        `<g transform="${grp.transform}">${grp.paths
          .map((p) => `<path fill="#172b39"${attr(p)}/>`)
          .join("")}</g>`,
    )
    .join("");
  const id = "neotoma-drafting-edge";
  const staticSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lockup.viewBox}" width="${lockup.width}" height="${lockup.height}" role="img" aria-label="Neotoma"><defs>${edgeFilter(id)}</defs><g filter="url(#${id})">${body}</g></svg>\n`;
  const ts = `// GENERATED by scripts/derive_neotoma_logo_drafting.mjs from frontend/public/brand/n2-nav-light.svg.\n// Do not edit. Geometry is copied byte for byte from the accepted lockup; only paint differs.\nexport const NEOTOMA_LOGO_DRAFTING = ${JSON.stringify(lockup, null, 2)} as const;\nexport const NEOTOMA_LOGO_EDGE = { radius: ${EDGE_RADIUS}, edgePx: ${EDGE_CSS_PX}, tintOpacity: ${TINT_OPACITY}, width: ${DRAFTING_WIDTH}, maxWidth: ${MAX_DRAFTING_WIDTH} } as const;\n`;
  return { staticSvg, ts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = fs.readFileSync(SRC);
  const provenance = JSON.parse(fs.readFileSync(path.join(root, "frontend/public/brand/PROVENANCE.json"), "utf-8"));
  verifySource(source, provenance);
  const { staticSvg, ts } = buildOutputs(source.toString("utf-8"));
  fs.writeFileSync(path.join(root, "frontend/public/brand/neotoma-lockup-drafting.svg"), staticSvg);
  fs.writeFileSync(path.join(root, "frontend/src/components/onepager/neotoma_logo_drafting.generated.ts"), ts);
  console.log("wrote drafting lockup (static svg + generated ts)");
}
