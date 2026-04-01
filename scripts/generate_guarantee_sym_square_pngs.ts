/**
 * Square (1:1) guarantee thumbnails in flat rounded minimal diagram style — transparent PNG,
 * dark beige / sand palette, subtle paper grain (see style reference in
 * frontend/src/assets/images/guarantees/style_reference_flat_hub.png).
 *
 * Outputs: guarantee_sym_<slug>_square.png (1024×1024).
 *
 * Requires OPENAI_API_KEY (or DEV_OPENAI_API_KEY / PROD_OPENAI_API_KEY).
 *
 * Usage: npm run illustrations:guarantees:sym:square
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import OpenAI from "openai";
import sharp from "sharp";

loadDotenv({ path: path.resolve(process.cwd(), ".env") });
loadDotenv({ path: path.resolve(process.cwd(), ".env.local"), override: true });
loadDotenv({ path: path.resolve(process.cwd(), "../ateles/.env"), override: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(repoRoot, "scripts/config/illustration_presets.json");
const OUT_DIR = path.join(repoRoot, "frontend/src/assets/images/guarantees");
const PRESET_ID = "guarantee_sym_square_flat";

const SQUARE = 1024;

interface IllustrationPreset {
  id: string;
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  background?: string;
  output_format?: string;
}

interface PresetFile {
  presets: IllustrationPreset[];
}

function redactSecrets(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "sk-…")
    .replace(/\bBearer\s+[\w.-]{12,}\b/gi, "Bearer …");
}

function composePrompt(base: string, concept: string): string {
  return `${base.trim()}\n\nSubject (flat iconic, centered in square): ${concept.trim()}`;
}

/** Same six guarantees as landscape cards; phrased for flat rounded diagram language. */
const JOBS: { slug: string; concept: string }[] = [
  {
    slug: "deterministic",
    concept:
      "A balance scale built from rounded pill shapes and soft rectangles: two pans perfectly level, identical rounded weights on each side; optional small rounded hub below; dashed curved connectors OK; symmetrical.",
  },
  {
    slug: "versioned",
    concept:
      "Tree-ring or layer-stack metaphor as concentric rounded arcs or stepped rounded rectangles stacked upward — each layer visible, nothing hidden; soft sand or pale beige fills between rings only (warm neutrals).",
  },
  {
    slug: "audit",
    concept:
      "Magnifying glass with thick rounded rim over a vertical stack of rounded list rows or a scroll shape; small check dots or witness marks; optional tiny stamp circle; desk still life simplified to icons.",
  },
  {
    slug: "silent",
    concept:
      "Sealed envelope or folded packet: large circular wax seal with ribbon tails; unbroken seal emphasized; rounded corners everywhere; no shield unless minimal.",
  },
  {
    slug: "schema",
    concept:
      "Stone arch or doorway as a thick rounded upside-down U or portal frame; keystone as a soft rectangle; dark beige masonry outline, light beige interior hint; centered threshold metaphor.",
  },
  {
    slug: "rebuild",
    concept:
      "Weaving loom simplified: horizontal rounded beam, vertical parallel threads as short rounded lines, small shuttle shape; cloth roll as rounded cylinder at bottom; orderly repetition.",
  },
];

async function loadPreset(): Promise<IllustrationPreset> {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw) as PresetFile;
  const found = parsed.presets.find((p) => p.id === PRESET_ID);
  if (!found) {
    throw new Error(`Preset "${PRESET_ID}" missing in ${CONFIG_PATH}`);
  }
  return found;
}

async function postProcessSquarePng(buffer: Buffer): Promise<Buffer> {
  const rotated = await sharp(buffer).rotate().toBuffer();
  return sharp(rotated)
    .ensureAlpha()
    .resize(SQUARE, SQUARE, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  const apiKey =
    process.env.OPENAI_API_KEY ?? process.env.DEV_OPENAI_API_KEY ?? process.env.PROD_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key. Set OPENAI_API_KEY (or DEV_OPENAI_API_KEY / PROD_OPENAI_API_KEY)."
    );
  }

  const preset = await loadPreset();
  const model = preset.model ?? "gpt-image-1";
  const size = preset.size ?? "1024x1024";
  const quality = preset.quality ?? "high";
  const background = (preset.background ?? "transparent") as "opaque" | "transparent" | "auto";
  const outputFormat = (preset.output_format ?? "png") as "png" | "jpeg" | "webp";

  await fs.mkdir(OUT_DIR, { recursive: true });
  const client = new OpenAI({ apiKey });
  const metadata: Array<{ file: string; prompt: string; model: string; size: string }> = [];

  for (const job of JOBS) {
    const prompt = composePrompt(preset.prompt, job.concept);
    const filename = `guarantee_sym_${job.slug}_square.png`;
    const outputPath = path.join(OUT_DIR, filename);

    console.log(`[GUARANTEE-SYM-SQUARE] Generating ${filename}…`);

    const result = await client.images.generate({
      model,
      prompt,
      size: size as any,
      quality: quality as any,
      background,
      output_format: outputFormat as any,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`No image data for ${filename}`);
    }

    const rawBuf = Buffer.from(b64, "base64");
    const outBuf = await postProcessSquarePng(rawBuf);
    await fs.writeFile(outputPath, outBuf);
    metadata.push({ file: outputPath, prompt, model, size });
    console.log(
      `  Wrote ${path.relative(repoRoot, outputPath)} (${(outBuf.length / 1024).toFixed(1)} KB)`
    );
  }

  const metaPath = path.join(OUT_DIR, "guarantee_sym_square_generation_metadata.json");
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf8");
  console.log(`[GUARANTEE-SYM-SQUARE] Metadata: ${path.relative(repoRoot, metaPath)}`);
  console.log("[GUARANTEE-SYM-SQUARE] Done.");
}

main().catch((err) => {
  console.error(`[GUARANTEE-SYM-SQUARE] Failed: ${redactSecrets((err as Error).message)}`);
  process.exit(1);
});
