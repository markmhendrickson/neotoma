import fs from "node:fs/promises";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import OpenAI from "openai";

loadDotenv({ path: path.resolve(process.cwd(), ".env") });
loadDotenv({ path: path.resolve(process.cwd(), ".env.local"), override: true });

function redactSecrets(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "sk-…")
    .replace(/\bBearer\s+[\w.-]{12,}\b/gi, "Bearer …");
}

type BackgroundMode = "transparent" | "opaque" | "auto";
type OutputFormat = "png" | "jpeg" | "webp";

interface IllustrationPreset {
  id: string;
  description?: string;
  prompt: string;
  output_dir?: string;
  model?: string;
  size?: string;
  quality?: string;
  background?: BackgroundMode;
  output_format?: OutputFormat;
  count?: number;
}

interface PresetFile {
  presets: IllustrationPreset[];
}

interface CliOptions {
  preset?: string;
  prompt?: string;
  concept?: string;
  outDir?: string;
  filePrefix?: string;
  /** When set, writes exactly `<out-dir>/<basename>.<format>` (no timestamp). Implies count 1. */
  basename?: string;
  model?: string;
  size?: string;
  quality?: string;
  background?: BackgroundMode;
  outputFormat?: OutputFormat;
  count?: number;
  dryRun: boolean;
  configPath: string;
}

function printHelp(): void {
  console.log(`
Generic illustration generator (OpenAI-backed, provider-extensible).

Usage:
  npm run illustrations:generate -- [options]

Options:
  --preset <id>           Preset id from config file
  --prompt "<text>"       Direct prompt (use this or --preset)
  --concept "<text>"      Extra concept appended to prompt
  --out-dir <path>        Output directory (default from preset)
  --file-prefix <prefix>  Filename prefix (default: generated_illustration)
  --basename <name>       Stable filename without extension (no timestamp; implies --count 1)
  --model <name>          Model override (default: gpt-image-1)
  --size <WxH>            Size override, e.g. 1024x1024
  --quality <value>       Quality override (low|medium|high|auto)
  --background <value>    transparent|opaque|auto
  --output-format <fmt>   png|jpeg|webp
  --count <n>             Number of images to generate
  --config <path>         Preset JSON path (default: scripts/config/illustration_presets.json)
  --dry-run               Print resolved job without generating
  --help, -h              Show this help

Examples:
  npm run illustrations:generate -- --preset beige_hero --concept "abstract packrat nest"
  npm run illustrations:generate -- --prompt "Minimal beige line-art, transparent background, abstract state layer" --count 4 --out-dir frontend/src/assets/images/hero
  `);
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    configPath: "scripts/config/illustration_presets.json",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);

    if (key === "help" || key === "h") {
      printHelp();
      process.exit(0);
    }

    if (key === "dry-run") {
      opts.dryRun = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    i += 1;

    switch (key) {
      case "preset":
        opts.preset = value;
        break;
      case "prompt":
        opts.prompt = value;
        break;
      case "concept":
        opts.concept = value;
        break;
      case "out-dir":
        opts.outDir = value;
        break;
      case "file-prefix":
        opts.filePrefix = value;
        break;
      case "basename":
        opts.basename = value;
        break;
      case "model":
        opts.model = value;
        break;
      case "size":
        opts.size = value;
        break;
      case "quality":
        opts.quality = value;
        break;
      case "background":
        opts.background = value as BackgroundMode;
        break;
      case "output-format":
        opts.outputFormat = value as OutputFormat;
        break;
      case "count":
        opts.count = parseNumber(value, 1);
        break;
      case "config":
        opts.configPath = value;
        break;
      default:
        throw new Error(`Unknown argument: --${key}`);
    }
  }

  return opts;
}

async function loadPreset(configPath: string, presetId: string): Promise<IllustrationPreset> {
  const absolutePath = path.resolve(configPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as PresetFile;
  const found = parsed.presets.find((p) => p.id === presetId);
  if (!found) {
    throw new Error(`Preset "${presetId}" not found in ${absolutePath}`);
  }
  return found;
}

function composePrompt(basePrompt: string, concept?: string): string {
  if (!concept) return basePrompt;
  return `${basePrompt}\n\nConcept focus: ${concept.trim()}`;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function decodeAndWriteImage(b64: string, outputPath: string): Promise<void> {
  const buffer = Buffer.from(b64, "base64");
  await fs.writeFile(outputPath, buffer);
}

function resolveJob(opts: CliOptions, preset?: IllustrationPreset) {
  const prompt = composePrompt(opts.prompt ?? preset?.prompt ?? "", opts.concept);
  const model = opts.model ?? preset?.model ?? "gpt-image-1";
  const size = opts.size ?? preset?.size ?? "1024x1024";
  const quality = opts.quality ?? preset?.quality ?? "medium";
  const background = (opts.background ?? preset?.background ?? "transparent") as BackgroundMode;
  const outputFormat = (opts.outputFormat ?? preset?.output_format ?? "png") as OutputFormat;
  const count = opts.basename ? 1 : opts.count ?? preset?.count ?? 1;
  const outputDir = path.resolve(
    opts.outDir ?? preset?.output_dir ?? "frontend/src/assets/images/generated"
  );
  const filePrefix = opts.filePrefix ?? preset?.id ?? "generated_illustration";

  if (!prompt.trim()) {
    throw new Error("No prompt resolved. Provide --prompt or --preset.");
  }

  return {
    prompt,
    model,
    size,
    quality,
    background,
    outputFormat,
    count,
    outputDir,
    filePrefix,
    basename: opts.basename,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const preset = opts.preset ? await loadPreset(opts.configPath, opts.preset) : undefined;
  const job = resolveJob(opts, preset);

  console.log("[ILLUSTRATIONS] Resolved job:");
  console.log(JSON.stringify({ ...job, basename: opts.basename }, null, 2));

  if (opts.dryRun) {
    console.log("[ILLUSTRATIONS] Dry run complete. No files written.");
    return;
  }

  const apiKey =
    process.env.OPENAI_API_KEY ?? process.env.DEV_OPENAI_API_KEY ?? process.env.PROD_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key. Set OPENAI_API_KEY (or DEV_OPENAI_API_KEY / PROD_OPENAI_API_KEY) before generation."
    );
  }

  await ensureDir(job.outputDir);
  const metadata: Array<{ file: string; prompt: string; model: string; size: string }> = [];
  const client = new OpenAI({ apiKey });
  const runStamp = nowStamp();

  for (let i = 0; i < job.count; i += 1) {
    const suffix = String(i + 1).padStart(2, "0");
    const filename = opts.basename
      ? `${opts.basename}.${job.outputFormat}`
      : `${job.filePrefix}_${runStamp}_${suffix}.${job.outputFormat}`;
    const outputPath = path.join(job.outputDir, filename);

    console.log(`[ILLUSTRATIONS] Generating ${filename} (${i + 1}/${job.count})...`);

    const result = await client.images.generate({
      model: job.model,
      prompt: job.prompt,
      size: job.size as any,
      quality: job.quality as any,
      background: job.background as any,
      output_format: job.outputFormat as any,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`No b64 image data returned for ${filename}`);
    }

    await decodeAndWriteImage(b64, outputPath);
    metadata.push({
      file: outputPath,
      prompt: job.prompt,
      model: job.model,
      size: job.size,
    });
  }

  const metadataPath = opts.basename
    ? path.join(job.outputDir, `${opts.basename}_metadata.json`)
    : path.join(job.outputDir, `${job.filePrefix}_${runStamp}_metadata.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  console.log(`[ILLUSTRATIONS] Done. Wrote ${job.count} image(s).`);
  console.log(`[ILLUSTRATIONS] Metadata: ${metadataPath}`);
}

main().catch((error) => {
  console.error(`[ILLUSTRATIONS] Failed: ${redactSecrets((error as Error).message)}`);
  process.exit(1);
});
