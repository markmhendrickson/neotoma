#!/usr/bin/env node
/**
 * Encodes the web files for the sheet 01 plate (FIG. A-1) from the two prepared plate frames,
 * without drawing, retouching or recolouring anything.
 *
 * The frames are generated rasters, not photographs. How they were made (full record, with every
 * sha256, in frontend/public/brand/PROVENANCE.json under "plate"):
 *   1. A vector structure render of the shared layout (frontend/src/components/onepager/plate_layout.ts)
 *      was given to Recraft's image_edit tool (external model nano_banana_pro) together with the
 *      accepted earlier-site hero photograph as the material reference. Both frames are therefore
 *      DERIVED FROM THE ACCEPTED HERO.
 *   2. Each raw output was registered back onto the layout frame (a resample of under 1 percent plus
 *      a few pixels of offset, found by edge correlation) so the inline SVG callouts land on the objects.
 *   3. In the phone frame, the PDF and email objects were replaced with the same objects cut from the
 *      cleared desktop generation (scaled to the phone geometry, ground tone matched, edges feathered),
 *      because the phone generation dropped the email's address block.
 * This script does only the last step: decode each prepared frame and re-encode it as WebP.
 * Run: node scripts/derive_neotoma_plate.mjs <wide frame PNG> <narrow frame PNG>
 * It refuses a frame whose sha256 is not the recorded one, writes the two files into
 * frontend/public/brand/plate/ and prints their sha256 for PROVENANCE.json. Encoder output can
 * differ between sharp builds, so CI checks the committed files against PROVENANCE.json.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "frontend/public/brand/plate");

/** The accepted earlier-site hero, used as the material reference for both generations. */
export const ACCEPTED_HERO_SHA256 =
  "8eee3947a65ac16fd41b359e558a6f4839c5c679cd6c8c1dcc0d4b115572476f";

/** Prepared frames: registered generations (the phone frame after the object transplant). */
export const FRAMES = {
  wide: {
    sha256: "869faca2f4524c52d9687ebdcded62e68afd2d355265c7a1a447ef932a7b977c",
    width: 1536,
    height: 1024,
    out: "neotoma-plate-a1-r2-wide.webp",
  },
  narrow: {
    sha256: "33c1e5a732c3f96f74b98e2febc9b12ede1e06abaa54aafc2ce1f9cd45837c30",
    width: 800,
    height: 1200,
    out: "neotoma-plate-a1-r2-narrow.webp",
  },
};
export const WEBP_QUALITY = 88;

/** Refuses a frame whose sha256 differs from the recorded hash. */
export function verifyFrame(name, bytes) {
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (!FRAMES[name] || actual !== FRAMES[name].sha256) {
    throw new Error(`refusing to derive: ${name} frame sha256 ${actual} is not the recorded one`);
  }
}

export async function derive(frames) {
  const { default: sharp } = await import("sharp");
  const out = {};
  for (const [name, bytes] of Object.entries(frames)) {
    verifyFrame(name, bytes);
    const want = FRAMES[name];
    const meta = await sharp(bytes).metadata();
    if (meta.width !== want.width || meta.height !== want.height) {
      throw new Error(`unexpected ${name} frame size ${meta.width}x${meta.height}`);
    }
    out[want.out] = await sharp(bytes)
      .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
      .toBuffer();
  }
  return out;
}

async function main() {
  const [wide, narrow] = process.argv.slice(2);
  if (!wide || !narrow) {
    throw new Error(
      "usage: node scripts/derive_neotoma_plate.mjs <wide frame PNG> <narrow frame PNG>"
    );
  }
  const out = await derive({ wide: fs.readFileSync(wide), narrow: fs.readFileSync(narrow) });
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
