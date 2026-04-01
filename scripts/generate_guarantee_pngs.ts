/**
 * Batch-generates full-size memory-guarantee PNGs (beige / hero-matched art direction).
 * See scripts/config/illustration_presets.json. Requires OpenAI image API key.
 *
 * Homepage **card thumbnails** (`guarantee_sym_*.png`): transparent PNG, dark beige editorial art
 * (preset `markmhendrickson_blog_hero_guarantee_sym`) — regenerate with
 * `npm run illustrations:guarantees:sym` (requires OpenAI image API key).
 * Square flat-diagram variants: `npm run illustrations:guarantees:sym:square` → `guarantee_sym_*_square.png`.
 *
 * Usage: npm run illustrations:guarantees
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(process.cwd(), ".env") });
loadDotenv({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
const genScript = path.join(repoRoot, "scripts", "generate_illustrations.ts");
const outDir = "frontend/src/assets/images/guarantees";

const JOBS: { basename: string; concept: string }[] = [
  {
    basename: "guarantee_deterministic_state",
    concept:
      "Two identical vertical stacks of three rounded rectangles side by side — same structure, same outcome (deterministic merge). No text, arrows, or UI chrome.",
  },
  {
    basename: "guarantee_versioned_history",
    concept:
      "Offset stack of paper sheets or layered cards with stepped top corners — every layer kept, nothing erased.",
  },
  {
    basename: "guarantee_auditable_change_log",
    concept:
      "Open ledger or notebook with horizontal ruled lines and small margin witness ticks — accountability and provenance.",
  },
  {
    basename: "guarantee_silent_mutation_prevention",
    concept:
      "Shield shape overlapping a simple document with lines — protection against hidden overwrites; still, serious tone.",
  },
  {
    basename: "guarantee_schema_constraints",
    concept:
      "One rounded shape fitting cleanly inside a gentle outer boundary or frame — only valid forms pass; not a flowchart.",
  },
  {
    basename: "guarantee_reproducible_reconstruction",
    concept:
      "Building blocks or cubes stacked on a flat plinth — same pieces rebuild the same structure.",
  },
];

function main(): void {
  for (const job of JOBS) {
    console.log(`\n[GUARANTEE-PNGS] ${job.basename} …`);
    execFileSync(
      tsxBin,
      [
        genScript,
        "--preset",
        "beige_guarantee_hero",
        "--basename",
        job.basename,
        "--out-dir",
        outDir,
        "--concept",
        job.concept,
      ],
      { stdio: "inherit", cwd: repoRoot }
    );
  }
  console.log("\n[GUARANTEE-PNGS] All guarantee PNGs generated.");
}

main();
