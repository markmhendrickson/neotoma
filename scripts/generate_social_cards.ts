/** Rebuild committed social cards: ./node_modules/.bin/tsx scripts/generate_social_cards.ts
 * Exact accepted archive objects and local fonts; no remote services or new artwork.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { SOCIAL_CARD } from "../frontend/src/site/social_card";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "frontend/public");
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const archiveFile = path.join(publicRoot, SOCIAL_CARD.archive);
const archive = fs.readFileSync(archiveFile, "utf8");
const materialFiles = [...archive.matchAll(/href="(\.\/materials\/[^\"]+)"/g)]
  .map((match) => path.resolve(path.dirname(archiveFile), match[1]));
const inputs = [...new Set([
  fileURLToPath(import.meta.url), path.join(root, "frontend/src/site/social_card.ts"),
  archiveFile, path.join(publicRoot, SOCIAL_CARD.logo),
  ...["instrument-serif.ttf", "instrument-sans-semibold.ttf"].map((name) => path.join(publicRoot, "brand/october", name)),
  ...materialFiles,
])];
const sourceInputs = Object.fromEntries(inputs.map((file) => [path.relative(root, file), sha(fs.readFileSync(file))]));
const outDir = path.join(publicRoot, "brand/october/social");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const cards = [];
try {
  for (const locale of ["en", "es"] as const) {
    const card = SOCIAL_CARD[locale];
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
      @font-face{font-family:InstrumentSerif;src:url('/brand/october/instrument-serif.ttf')}
      @font-face{font-family:InstrumentSans;src:url('/brand/october/instrument-sans-semibold.ttf');font-weight:600}
      *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#f2eee5;color:#172b39}
      .identity{position:absolute;left:64px;top:58px;width:228px;height:auto}
      h1{position:absolute;left:64px;top:188px;width:430px;margin:0;font:400 62px/1.07 InstrumentSerif,serif;letter-spacing:-1.2px}
      .domain{position:absolute;left:64px;bottom:56px;margin:0;font:600 17px InstrumentSans,sans-serif;letter-spacing:1px}
      object{position:absolute;left:489px;top:98px;width:680px;height:453.333px;border:0}
    </style></head><body><img class="identity" src="/${SOCIAL_CARD.logo}" alt="Neotoma"><h1>${card.headline.join("<br>")}</h1><p class="domain">neotoma.io</p><object type="image/svg+xml" data="/${SOCIAL_CARD.archive}" aria-label="${card.alt}"></object></body></html>`;
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const failures: string[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "https://social-card.test") { failures.push(url.href); await route.abort(); return; }
      if (url.pathname === "/card") { await route.fulfill({ body: html, contentType: "text/html" }); return; }
      const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(file)) { failures.push(url.href); await route.abort(); return; }
      const mime: Record<string, string> = { ".svg": "image/svg+xml", ".webp": "image/webp", ".ttf": "font/ttf" };
      await route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] ?? "application/octet-stream" });
    });
    await page.goto("https://social-card.test/card", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const profile = await page.locator("object").evaluate((object) => (object as HTMLObjectElement).contentDocument?.querySelector("svg")?.getAttribute("data-archive-layout"));
    if (failures.length || profile !== "desktop") throw new Error(`Incomplete local card resources: ${failures.join(", ")}`);
    const png = await page.screenshot({ type: "png" });
    const metadata = await sharp(png).metadata();
    if (metadata.width !== 1200 || metadata.height !== 630) throw new Error("Unexpected social card size");
    fs.writeFileSync(path.join(publicRoot, card.path), png);
    cards.push({ locale, path: card.path, mime: SOCIAL_CARD.mime, width: 1200, height: 630, sha256: sha(png) });
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(outDir, "source-receipt.json"), JSON.stringify({ sourceInputs, cards }, null, 2) + "\n");
console.log(`Generated ${cards.length} local 1200×630 archive social cards.`);
