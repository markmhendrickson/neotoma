#!/usr/bin/env tsx
/**
 * Validates MDX site companion metadata under docs/site/pages:
 * - every *.meta.json has a sibling *.mdx
 * - every meta.path appears in ROUTE_METADATA (seo_metadata.ts)
 * - basic translation field rules
 *
 * Run: tsx scripts/validate_mdx_site_pages.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pagesDir = path.join(repoRoot, "docs/site/pages");
const seoPath = path.join(repoRoot, "frontend/src/site/seo_metadata.ts");

const SUPPORTED_LOCALES = new Set([
  "en",
  "es",
  "ca",
  "zh",
  "hi",
  "ar",
  "fr",
  "pt",
  "ru",
  "bn",
  "ur",
  "id",
  "de",
]);

function extractRouteMetadataKeys(): Set<string> {
  const source = fs.readFileSync(seoPath, "utf-8");
  const metaMatch = source.match(
    /const ROUTE_METADATA:\s*Record<string,\s*SeoRouteMetadata>\s*=\s*\{([^]*?)\n\};/,
  );
  if (!metaMatch) throw new Error("Could not locate ROUTE_METADATA in seo_metadata.ts");
  const block = metaMatch[1];
  const keys = new Set<string>();
  const re = /^\s+"(\/[^"]*)":\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

interface MetaJson {
  path: string;
  locale: string;
  page_title: string;
  translation_of: string | null;
  source_locale: string;
  translated_from_revision: string;
  translation_status: string;
}

function main() {
  let exit = 0;
  const routeKeys = extractRouteMetadataKeys();

  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile() && ent.name.endsWith(".meta.json")) {
        const siblingMdx = abs.replace(/\.meta\.json$/i, ".mdx");
        if (!fs.existsSync(siblingMdx)) {
          console.error(`❌ Missing sibling MDX for ${path.relative(repoRoot, abs)}`);
          exit = 1;
          continue;
        }
        let meta: MetaJson;
        try {
          meta = JSON.parse(fs.readFileSync(abs, "utf-8")) as MetaJson;
        } catch (e) {
          console.error(`❌ Invalid JSON ${path.relative(repoRoot, abs)}: ${e}`);
          exit = 1;
          continue;
        }
        if (!meta.path?.startsWith("/")) {
          console.error(`❌ meta.path must be absolute path: ${abs}`);
          exit = 1;
        }
        if (!routeKeys.has(meta.path)) {
          console.error(`❌ meta.path not in ROUTE_METADATA: ${meta.path} (${path.relative(repoRoot, abs)})`);
          exit = 1;
        }
        if (!SUPPORTED_LOCALES.has(meta.locale)) {
          console.error(`❌ Unsupported locale in meta: ${meta.locale} (${path.relative(repoRoot, abs)})`);
          exit = 1;
        }
        if (!SUPPORTED_LOCALES.has(meta.source_locale)) {
          console.error(`❌ Unsupported source_locale in meta: ${meta.source_locale} (${path.relative(repoRoot, abs)})`);
          exit = 1;
        }
        if (meta.locale === "en" && meta.translation_of != null) {
          console.error(`❌ English meta should have translation_of null: ${path.relative(repoRoot, abs)}`);
          exit = 1;
        }
        if (meta.locale !== "en" && meta.translation_of == null) {
          console.error(`❌ Non-English meta should set translation_of: ${path.relative(repoRoot, abs)}`);
          exit = 1;
        }
      }
    }
  };

  if (!fs.existsSync(pagesDir)) {
    console.error(`❌ Missing pages dir ${path.relative(repoRoot, pagesDir)}`);
    process.exit(1);
  }

  walk(pagesDir);

  if (exit === 0) {
    console.log("✓ MDX site page metadata validation passed.");
  }
  process.exit(exit);
}

main();
