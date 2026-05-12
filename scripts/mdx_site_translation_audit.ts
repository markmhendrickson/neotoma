#!/usr/bin/env tsx
/**
 * Writes `docs/site/generated/translation_audit.md` summarizing MDX translation
 * coverage per canonical `meta.path` (which locales exist, revision parity).
 *
 * Run: tsx scripts/mdx_site_translation_audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pagesDir = path.join(repoRoot, "docs/site/pages");
const outDir = path.join(repoRoot, "docs/site/generated");

interface MetaJson {
  path: string;
  locale: string;
  translated_from_revision: string;
  translation_status: string;
}

function main() {
  const byPath = new Map<string, MetaJson[]>();
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile() && ent.name.endsWith(".meta.json")) {
        const meta = JSON.parse(fs.readFileSync(abs, "utf-8")) as MetaJson;
        const list = byPath.get(meta.path) ?? [];
        list.push(meta);
        byPath.set(meta.path, list);
      }
    }
  };
  walk(pagesDir);

  const lines: string[] = [
    "# MDX translation audit (generated)",
    "",
    "| Canonical path | Locales | Revisions | Statuses |",
    "|----------------|---------|-----------|----------|",
  ];

  for (const [p, metas] of [...byPath.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const locales = metas.map((m) => m.locale).sort().join(", ");
    const revs = [...new Set(metas.map((m) => m.translated_from_revision))].join(" / ");
    const stats = [...new Set(metas.map((m) => m.translation_status))].join(", ");
    lines.push(`| \`${p}\` | ${locales} | ${revs} | ${stats} |`);
  }

  lines.push("", "_Regenerate with `tsx scripts/mdx_site_translation_audit.ts`._", "");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "translation_audit.md"), lines.join("\n"), "utf-8");
  console.log("Wrote docs/site/generated/translation_audit.md");
}

main();
