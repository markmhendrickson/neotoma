#!/usr/bin/env node
/**
 * Derives the web files for the sheet 01 plate (FIG. A-1) from the ACCEPTED earlier-site hero
 * photograph, without drawing, retouching or recolouring anything.
 *
 * Source (accepted, the neotoma brand photograph of the earlier Neotoma site; same file as the
 * "neotoma" entry of og-photo-inventory.mjs and the "N-hero" entry of tension-trace-r2-art.json in
 * the sites repository; see frontend/public/brand/PROVENANCE.json):
 *   shared/site/generator/dist/images/tension-trace-r2/N-hero.jpg   1536 x 1024 JPEG
 * Derivation, the only operations applied:
 *   wide    decode, re-encode (WebP q88, JPEG q85 fallback) at the full 1536 x 1024 frame
 *   narrow  decode, crop to NARROW_CROP, resample to NARROW_SIZE, re-encode (same settings)
 * No pixel is painted, no object is moved, nothing is composited. The drafting annotations are
 * inline SVG drawn over the image in the page (onepager_plate.tsx); the files stay annotation free.
 * Run: node scripts/derive_neotoma_plate.mjs <path to N-hero.jpg>
 * The script refuses a source whose sha256 is not the accepted one, writes the four files into
 * frontend/public/brand/plate/ and prints their sha256 for PROVENANCE.json. Encoder output can differ
 * between sharp builds, so CI checks the committed files against PROVENANCE.json, not a re-derivation.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "frontend/public/brand/plate");

export const ACCEPTED_SOURCE_SHA256 =
  "8eee3947a65ac16fd41b359e558a6f4839c5c679cd6c8c1dcc0d4b115572476f";
export const SOURCE_SIZE = { width: 1536, height: 1024 };
/** Window of the source frame kept for 390 px phones: the right-hand objects, not a shrunk wide frame. */
export const NARROW_CROP = { left: 652, top: 0, width: 884, height: 1024 };
/** About 2.3x the 314 CSS px the figure gets at a 390 px viewport. */
export const NARROW_SIZE = { width: 728, height: 843 };
export const WEBP_QUALITY = 88;
export const JPEG_QUALITY = 85;

export const OUTPUT_NAMES = [
  "neotoma-plate-a1-wide.webp",
  "neotoma-plate-a1-wide.jpg",
  "neotoma-plate-a1-narrow.webp",
  "neotoma-plate-a1-narrow.jpg",
];

/** Refuses a source file whose sha256 differs from the accepted hash. */
export function verifySource(bytes) {
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actual !== ACCEPTED_SOURCE_SHA256) {
    throw new Error(
      `refusing to derive: source sha256 ${actual} is not the accepted ${ACCEPTED_SOURCE_SHA256}`
    );
  }
}

export async function derive(sourceBytes) {
  verifySource(sourceBytes);
  const { default: sharp } = await import("sharp");
  const meta = await sharp(sourceBytes).metadata();
  if (meta.width !== SOURCE_SIZE.width || meta.height !== SOURCE_SIZE.height) {
    throw new Error(`unexpected source size ${meta.width}x${meta.height}`);
  }
  const wide = () => sharp(sourceBytes);
  const narrow = () =>
    sharp(sourceBytes)
      .extract(NARROW_CROP)
      .resize({ ...NARROW_SIZE, fit: "fill", kernel: "lanczos3" });
  const webp = { quality: WEBP_QUALITY, effort: 6, smartSubsample: true };
  const jpeg = { quality: JPEG_QUALITY, mozjpeg: true };
  return {
    "neotoma-plate-a1-wide.webp": await wide().webp(webp).toBuffer(),
    "neotoma-plate-a1-wide.jpg": await wide().jpeg(jpeg).toBuffer(),
    "neotoma-plate-a1-narrow.webp": await narrow().webp(webp).toBuffer(),
    "neotoma-plate-a1-narrow.jpg": await narrow().jpeg(jpeg).toBuffer(),
  };
}

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error("usage: node scripts/derive_neotoma_plate.mjs <path to N-hero.jpg>");
  const out = await derive(fs.readFileSync(src));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, buf] of Object.entries(out)) {
    fs.writeFileSync(path.join(OUT_DIR, name), buf);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    console.log(`${name}  ${buf.length} bytes  sha256 ${sha}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
