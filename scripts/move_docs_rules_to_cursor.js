#!/usr/bin/env node
/**
 * Move all *_rules.mdc and *_rules.md from docs/ to .cursor/rules/
 * with "_rules" suffix removed from filename.
 * Target name: {dir path with / -> _}_{basename without _rules}.{ext}
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const docsDir = path.join(repoRoot, "docs");
const cursorRulesDir = path.join(repoRoot, ".cursor", "rules");

function findRuleFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      findRuleFiles(full, files);
    } else if (e.isFile() && (e.name.endsWith("_rules.mdc") || e.name.endsWith("_rules.md"))) {
      files.push(path.relative(docsDir, full));
    }
  }
  return files;
}

function toTargetName(relPath) {
  const dir = path.dirname(relPath);
  const base = path.basename(relPath);
  const ext = path.extname(base);
  const baseNoExt = base.slice(0, -ext.length);
  const name = baseNoExt.replace(/_rules$/, "");
  const prefix = dir.replace(/\//g, "_");
  const targetBase = prefix ? `${prefix}_${name}${ext}` : `${name}${ext}`;
  return targetBase;
}

if (!fs.existsSync(cursorRulesDir)) {
  fs.mkdirSync(cursorRulesDir, { recursive: true });
}

const relFiles = findRuleFiles(docsDir);
let moved = 0;
for (const rel of relFiles) {
  const src = path.join(docsDir, rel);
  const targetName = toTargetName(rel);
  const dest = path.join(cursorRulesDir, targetName);
  const content = fs.readFileSync(src, "utf8");
  fs.writeFileSync(dest, content);
  fs.unlinkSync(src);
  console.log("Moved", rel, "->", targetName);
  moved++;
}
console.log("Total moved:", moved);
