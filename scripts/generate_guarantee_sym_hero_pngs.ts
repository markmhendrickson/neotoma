/**
 * Regenerates homepage `guarantee_sym_*.png` thumbnails: transparent PNG, dark beige editorial
 * linework, distinct metaphors per card. Uses OpenAI image generation + sharp resize/crop to
 * 960×536 (2× card slot). Preserves alpha (no flatten to black).
 *
 * Requires OPENAI_API_KEY (or DEV_OPENAI_API_KEY / PROD_OPENAI_API_KEY).
 *
 * Usage: npm run illustrations:guarantees:sym
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
const PRESET_ID = "markmhendrickson_blog_hero_guarantee_sym";

const CARD_W = 960;
const CARD_H = 536;

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
  return `${base.trim()}\n\nScene / metaphor: ${concept.trim()}`;
}

/** Six unique material worlds — readable at thumbnail scale; no overlapping metaphors. */
const JOBS: { basename: string; concept: string }[] = [
  {
    basename: "guarantee_sym_deterministic",
    concept:
      "A brass or metal balance scale: two pans perfectly level, identical small weights or objects on each side — symmetry, same outcome every time. Metal engraved texture in dark beige linework only.",
  },
  {
    basename: "guarantee_sym_versioned",
    concept:
      "Cross-section of a tree trunk seen from the front: concentric growth rings clearly visible — each ring a preserved version, time stacked, nothing erased. Wood grain and ring texture in hatched dark beige lines only.",
  },
  {
    basename: "guarantee_sym_audit",
    concept:
      "Notary’s still life: open ledger on a desk, wax seal stamp, ink pot, quill — official record and provenance. Paper, metal, and glass suggested by line and hatching only; dark beige strokes.",
  },
  {
    basename: "guarantee_sym_silent",
    concept:
      "A folded letter or packet with an unbroken wax seal and ribbon — tamper-evident; seal intact means nothing changed in secret. Parchment folds and wax roundel as the focal silhouette.",
  },
  {
    basename: "guarantee_sym_schema",
    concept:
      "A stone archway or gatehouse threshold — masonry voussoirs and keystone, dark opening beyond; only what fits the passage could pass. Heavy vertical architecture, no paper.",
  },
  {
    basename: "guarantee_sym_rebuild",
    concept:
      "A weaving loom with warp threads and partially woven cloth on the beam, shuttle resting on the frame — same pattern reproduces the same textile from the same threads. Wood and fiber texture in dark beige linework only.",
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

/** Preserve transparency; crop/resize for card slot (subject biased to bottom). */
async function postProcessCardPng(buffer: Buffer, preserveAlpha: boolean): Promise<Buffer> {
  const rotated = await sharp(buffer).rotate().toBuffer();
  let pipeline = sharp(rotated);
  if (!preserveAlpha) {
    const meta = await sharp(rotated).metadata();
    if (meta.hasAlpha) {
      pipeline = pipeline.flatten({ background: { r: 0, g: 0, b: 0 } });
    }
  } else {
    pipeline = pipeline.ensureAlpha();
  }
  return pipeline
    .resize(CARD_W, CARD_H, { fit: "cover", position: "south" })
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
  const size = preset.size ?? "1536x1024";
  const quality = preset.quality ?? "high";
  const background = (preset.background ?? "transparent") as "opaque" | "transparent" | "auto";
  const outputFormat = (preset.output_format ?? "png") as "png" | "jpeg" | "webp";
  const preserveAlpha = background === "transparent";

  await fs.mkdir(OUT_DIR, { recursive: true });
  const client = new OpenAI({ apiKey });
  const metadata: Array<{ file: string; prompt: string; model: string; size: string }> = [];

  for (const job of JOBS) {
    const prompt = composePrompt(preset.prompt, job.concept);
    const filename = `${job.basename}.png`;
    const outputPath = path.join(OUT_DIR, filename);

    console.log(`[GUARANTEE-SYM] Generating ${filename}…`);

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
    const cardBuf = await postProcessCardPng(rawBuf, preserveAlpha);
    await fs.writeFile(outputPath, cardBuf);
    metadata.push({ file: outputPath, prompt, model, size });
    console.log(
      `  Wrote ${path.relative(repoRoot, outputPath)} (${(cardBuf.length / 1024).toFixed(1)} KB)`
    );
  }

  const metaPath = path.join(OUT_DIR, "guarantee_sym_hero_generation_metadata.json");
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf8");
  console.log(`[GUARANTEE-SYM] Metadata: ${path.relative(repoRoot, metaPath)}`);
  console.log("[GUARANTEE-SYM] Done.");
}

main().catch((err) => {
  console.error(`[GUARANTEE-SYM] Failed: ${redactSecrets((err as Error).message)}`);
  process.exit(1);
});
