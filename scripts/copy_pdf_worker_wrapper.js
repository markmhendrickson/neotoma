/**
 * Copy scripts/pdf_worker_polyfill.mjs to dist/scripts/ so the built server
 * finds the PDF worker wrapper when running from dist/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const src = path.join(repoRoot, "scripts", "pdf_worker_polyfill.mjs");
const destDir = path.join(repoRoot, "dist", "scripts");
const dest = path.join(destDir, "pdf_worker_polyfill.mjs");

if (!fs.existsSync(src)) {
  process.exit(0);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
