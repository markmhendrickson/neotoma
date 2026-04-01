/**
 * Square Who-ICP card art — same flat diagram language as guarantee_sym squares, but each
 * profile uses a distinct accent (sky / violet / amber). Transparent PNG 1024×1024.
 *
 * Outputs: frontend/src/assets/images/who/who_icp_<key>_square.png
 *
 * Usage: npm run illustrations:who-icp:square
 *        npm run illustrations:who-icp:square -- --only=operating
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
const OUT_DIR = path.join(repoRoot, "frontend/src/assets/images/who");
const PRESET_ID = "who_icp_square_flat";

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

function composePrompt(base: string, block: string): string {
  return `${base.trim()}\n\n${block.trim()}`;
}

const JOBS: { fileKey: string; block: string }[] = [
  {
    fileKey: "operating",
    block: `ACCENT FAMILY — SKY / CYAN-BLUE ONLY: #0ea5e9, #38bdf8, #7dd3fc, #bae6fd. Apply sky color to the entire bridge: deck, arch or beam, railings, and any suspension or truss lines.

Subject — LITERAL BRIDGE (must read as “bridge” at thumbnail size): Two separate rounded-rectangle “banks” or tool pads at the LEFT and RIGHT (beige/taupe outlines, soft sand fills). Between them, a single bridge span: either a smooth rounded arch or a flat girder with simple parallel railings; open transparent gap under the span so the bridge clearly crosses empty space. Optional tiny rounded piers at each end in beige. Dashed sky lines along the deck edge are OK.

Do NOT use generic “network nodes” or three robots unless the bridge remains the dominant silhouette. No text, no people.

Visual consistency: match Neotoma homepage guarantee icons — same rounded-stroke weight, paper grain on fills, centered composition, generous margin inside the square.`,
  },
  {
    fileKey: "building_pipelines",
    block: `ACCENT FAMILY — VIOLET ONLY: #6d28d9, #7c3aed, #8b5cf6, #a78bfa, #ddd6fe (use for pipe segments, junction highlights, flow emphasis).

Subject: Horizontal pipeline of rounded tube or pill segments with one soft junction/valve shape — building data or agent pipelines. Beige/taupe for structure lines; violet for the “live” path and key junctions.`,
  },
  {
    fileKey: "debugging_infrastructure",
    block: `ACCENT FAMILY — AMBER / GOLD ONLY: #d97706, #f59e0b, #fbbf24, #fde68a (use for lens ring, highlights, diff ticks, warning dots).

Subject: Magnifying glass with thick rounded rim over two parallel rounded horizontal strips (like timeline or log rows) with one small mismatch or ghost dot between them — inspection, diff, non-determinism. Beige neutrals for paper strips; amber for glass rim and emphasis marks.`,
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

  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlyKey = onlyArg?.slice("--only=".length).trim();
  const jobsToRun = onlyKey ? JOBS.filter((j) => j.fileKey === onlyKey) : JOBS;
  if (onlyKey && jobsToRun.length === 0) {
    throw new Error(
      `Unknown --only="${onlyKey}". Valid: ${JOBS.map((j) => j.fileKey).join(", ")}`
    );
  }
  if (onlyKey) {
    console.log(`[WHO-ICP-SQUARE] --only=${onlyKey} (${jobsToRun.length} job(s))`);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const client = new OpenAI({ apiKey });
  const metadata: Array<{ file: string; prompt: string; model: string; size: string }> = [];

  for (const job of jobsToRun) {
    const prompt = composePrompt(preset.prompt, job.block);
    const filename = `who_icp_${job.fileKey}_square.png`;
    const outputPath = path.join(OUT_DIR, filename);

    console.log(`[WHO-ICP-SQUARE] Generating ${filename}…`);

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

  const metaPath = path.join(OUT_DIR, "who_icp_square_generation_metadata.json");
  let merged = metadata;
  if (onlyKey) {
    try {
      const prevRaw = await fs.readFile(metaPath, "utf8");
      const prev = JSON.parse(prevRaw) as typeof metadata;
      const newPaths = new Set(metadata.map((m) => m.file));
      merged = [...prev.filter((m) => !newPaths.has(m.file)), ...metadata];
    } catch {
      /* no prior file */
    }
  }
  await fs.writeFile(metaPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`[WHO-ICP-SQUARE] Metadata: ${path.relative(repoRoot, metaPath)}`);
  console.log("[WHO-ICP-SQUARE] Done.");
}

main().catch((err) => {
  console.error(`[WHO-ICP-SQUARE] Failed: ${redactSecrets((err as Error).message)}`);
  process.exit(1);
});
