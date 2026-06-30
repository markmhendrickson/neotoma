#!/usr/bin/env node
/**
 * Breaking-change documentation gate.
 *
 * Fails a release when the OpenAPI breaking-change diff reports at least one
 * breaking change but the release supplement's "Breaking changes" section is
 * missing, empty, or normalizes to a "nothing here" placeholder
 * (`None`, `No breaking changes.`, `N/A`, …).
 *
 * This closes the #1841 trap: the v0.18.0 `observation_source` enum tightening
 * was a real OpenAPI/validation breaking change, yet that release's supplement
 * declared `## Breaking changes\n- None.` and shipped the break undocumented.
 *
 * The detector is the existing `scripts/openapi_bc_diff.js` (run with --json).
 * It is injected so the unit test can stub it without touching git/openapi.yaml.
 *
 * Usage:
 *   node scripts/validate_breaking_changes_documented.js --tag <vX.Y.Z> --base <ref> [--head <ref>]
 *
 * Exit codes:
 *   0 — no breaking diff, OR breaking diff present AND documented.
 *   1 — breaking diff present but the supplement's Breaking changes section is
 *       missing / empty / a "none" placeholder (the gate fires).
 *   2 — usage / environment error (missing tag, missing supplement file, etc.).
 *
 * Registered as: npm run validate:breaking-changes
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const PROCESS_DOC = "docs/developer/github_release_process.md";

// Phrases that, when a "Breaking changes" section consists only of them
// (after stripping markdown list/heading punctuation), mean "nothing declared".
const EMPTY_MARKERS = new Set([
  "",
  "none",
  "none.",
  "n/a",
  "na",
  "no breaking changes",
  "no breaking changes.",
  "no breaking change",
  "no breaking change.",
  "nothing",
  "nothing.",
]);

export function parseArgs(argv) {
  const args = { tag: null, base: null, head: "HEAD" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") args.tag = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: validate_breaking_changes_documented.js --tag <vX.Y.Z> --base <ref> [--head <ref>]\n"
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * Default breaking-change detector: shells out to scripts/openapi_bc_diff.js
 * --json and returns the parsed breaking[] array. openapi_bc_diff.js exits 1
 * when breaking changes exist, so a non-zero exit with parseable JSON is the
 * normal "breaking changes found" path, not an error.
 */
export function defaultDetectBreaking({ base, head }) {
  const scriptPath = path.join(__dirname, "openapi_bc_diff.js");
  const cliArgs = [scriptPath, "--json", "--head", head];
  if (base) {
    cliArgs.push("--base", base);
  }
  let stdout;
  try {
    stdout = execFileSync("node", cliArgs, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // exit 1 = breaking changes present; stdout still holds the JSON payload.
    if (err.stdout) {
      stdout = err.stdout.toString();
    } else {
      throw new Error(`openapi_bc_diff.js failed without JSON output: ${err.message}`);
    }
  }
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error(`Could not parse JSON from openapi_bc_diff.js. Raw output:\n${stdout}`);
  }
  return Array.isArray(payload.breaking) ? payload.breaking : [];
}

export function supplementPath(tag) {
  return path.join(
    repoRoot,
    "docs",
    "releases",
    "in_progress",
    tag,
    "github_release_supplement.md"
  );
}

/**
 * Extract the body of the "## Breaking changes" section (lines after the
 * heading up to the next `## ` heading or EOF). Returns null when the heading
 * is absent.
 */
export function extractBreakingSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    if (/^#{1,6}\s+breaking changes\s*$/i.test(lines[i].trim())) {
      break;
    }
  }
  if (i >= lines.length) return null; // heading not found
  const body = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^#{1,6}\s+\S/.test(lines[j])) break; // next heading
    body.push(lines[j]);
  }
  return body.join("\n");
}

/**
 * True when the section body declares no real breaking changes — empty, or
 * consisting only of "none"/"no breaking changes"-style placeholders.
 */
export function sectionIsEmpty(sectionBody) {
  if (sectionBody == null) return true;
  // Reduce every line to its bare phrase: strip markdown list bullets,
  // blockquotes, emphasis, and trailing punctuation/whitespace.
  const meaningful = sectionBody
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*[-*+]\s+/, "") // list bullet
        .replace(/^\s*>\s?/, "") // blockquote
        .replace(/[*_`]/g, "") // emphasis/code ticks
        .trim()
        .toLowerCase()
    )
    .filter((line) => line.length > 0);

  if (meaningful.length === 0) return true;
  // Empty iff EVERY meaningful line is a "none" marker.
  return meaningful.every((line) => EMPTY_MARKERS.has(line));
}

/**
 * Core logic, decoupled from process exit so it is unit-testable.
 * Returns { ok, code, message }.
 */
export function evaluate({ tag, base, head }, deps = {}) {
  const detectBreaking = deps.detectBreaking ?? defaultDetectBreaking;
  const readSupplement =
    deps.readSupplement ??
    ((t) => {
      const p = supplementPath(t);
      if (!fs.existsSync(p)) return null;
      return fs.readFileSync(p, "utf-8");
    });

  if (!tag) {
    return { ok: false, code: 2, message: "Missing required --tag <vX.Y.Z>." };
  }

  const breaking = detectBreaking({ base, head });

  if (!breaking || breaking.length === 0) {
    return {
      ok: true,
      code: 0,
      message: "No OpenAPI breaking changes detected; gate satisfied.",
    };
  }

  const markdown = readSupplement(tag);
  if (markdown == null) {
    return {
      ok: false,
      code: 2,
      message:
        `Release supplement not found for ${tag} ` +
        `(expected docs/releases/in_progress/${tag}/github_release_supplement.md). ` +
        `Create it per ${PROCESS_DOC}.`,
    };
  }

  const section = extractBreakingSection(markdown);
  if (sectionIsEmpty(section)) {
    const list = breaking
      .map((b) => `  - ${b.kind ?? "breaking"} ${b.key ?? ""} — ${b.detail ?? ""}`)
      .join("\n");
    return {
      ok: false,
      code: 1,
      message:
        `${breaking.length} OpenAPI breaking change(s) detected, but the ` +
        `"Breaking changes" section in the ${tag} supplement is missing or empty.\n\n` +
        `Detected breaking changes:\n${list}\n\n` +
        `Document each one (before/after shape, error code, migration step) in ` +
        `docs/releases/in_progress/${tag}/github_release_supplement.md under ` +
        `"## Breaking changes". See ${PROCESS_DOC} ` +
        `(§ "Validation tightening is breaking"). An empty section must carry ` +
        `"No breaking changes." ONLY when the diff is genuinely clean.`,
    };
  }

  return {
    ok: true,
    code: 0,
    message:
      `${breaking.length} breaking change(s) detected and the ${tag} ` +
      `supplement documents a non-empty Breaking changes section; gate satisfied.`,
  };
}

function main() {
  const args = parseArgs(process.argv);
  let result;
  try {
    result = evaluate(args);
  } catch (err) {
    process.stderr.write(`validate:breaking-changes error: ${err.message}\n`);
    process.exit(2);
  }
  if (result.ok) {
    process.stdout.write(`✓ ${result.message}\n`);
  } else {
    process.stderr.write(`✗ ${result.message}\n`);
  }
  process.exit(result.code);
}

// Only run main() when executed directly (not when imported by the unit test).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  main();
}
