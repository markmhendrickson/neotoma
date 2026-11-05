#!/usr/bin/env tsx
/** Prefix local export links for a /pr-N/ GitHub Pages mount after root-mode validation. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function mountedPath(path: string, mount: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /^\/pr-\d+\//.test(path)) return path;
  return `${mount}${path}`;
}

export function rewritePreviewHtml(html: string, prNumber: number): string {
  const mount = `/pr-${prNumber}`;
  return html
    .replace(/\b(href|src|srcset)="([^"]*)"/g, (_match, name: string, value: string) => {
      if (name !== "srcset") return `${name}="${mountedPath(value, mount)}"`;
      return `${name}="${value.replace(/(^|,\s*)(\/[^\s,]+)/g, (_candidate, lead: string, path: string) => `${lead}${mountedPath(path, mount)}`)}"`;
    })
    .replace(
      /url\(\s*(['"]?)(\/[^)'"\s]+)\1\s*\)/g,
      (_match, quote: string, path: string) => `url(${quote}${mountedPath(path, mount)}${quote})`
    );
}

function rewriteDirectory(dir: string, prNumber: number): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) rewriteDirectory(path, prNumber);
    else if (entry.isFile() && /\.(html|css)$/.test(entry.name)) {
      const before = readFileSync(path, "utf8");
      const after = rewritePreviewHtml(before, prNumber);
      if (after !== before) writeFileSync(path, after);
    }
  }
}

if (process.argv[1]?.endsWith("rewrite_docs_pr_preview.ts")) {
  const [dir, number] = process.argv.slice(2);
  const prNumber = Number(number);
  if (!dir || !Number.isSafeInteger(prNumber) || prNumber < 1)
    throw new Error("Usage: rewrite_docs_pr_preview.ts <export-directory> <positive-pr-number>");
  rewriteDirectory(dir, prNumber);
}
