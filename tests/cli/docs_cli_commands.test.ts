/**
 * install.md and docs/developer/cli_reference.md name `neotoma` commands that
 * installing agents run verbatim. This test extracts every `neotoma ...`
 * invocation from both files (inline code spans, and lines in bash fences that
 * start with `neotoma `), and checks against the built CLI that:
 *
 * - the command path exists (its help's `Usage:` line names it), and
 * - every `--flag` in the invocation appears in that command's help or in the
 *   global options.
 *
 * Help is read with `neotoma help <cmd>` and `neotoma <parent> help <sub>`:
 * `neotoma <parent> <sub> --help` prints the top-level help for most nested
 * commands, which would make every nested flag look valid.
 *
 * Needs dist/ (the unit lane runs `npm run build:server` first, and
 * vitest.global_setup.ts refuses to start without it). No network.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(REPO_ROOT, "dist", "cli", "index.js");
const DOCS = ["install.md", "docs/developer/cli_reference.md"];

/** Invocations that are expected not to resolve, each with the reason. Every entry must be hit. */
const EXPECTED_MISSES: Record<string, string> = {
  "neotoma session": "cli_reference.md says explicitly that `neotoma session` is not a command",
  "neotoma help <command>":
    "Commander's built-in help command, shown as the way to check a command",
};

/** Leading tokens that select an environment rather than name a command. */
const ENV_SHORTCUTS = new Set(["dev", "prod"]);

const home = mkdtempSync(path.join(os.tmpdir(), "neotoma-docs-cli-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

const helpCache = new Map<string, string>();
function help(parts: string[]): string {
  const key = parts.join(" ");
  const cached = helpCache.get(key);
  if (cached !== undefined) return cached;
  const args =
    parts.length === 0
      ? ["--help"]
      : parts.length === 1
        ? ["help", parts[0]!]
        : [parts[0]!, "help", ...parts.slice(1)];
  let out: string;
  try {
    out = execFileSync(process.execPath, [CLI, ...args], {
      cwd: home,
      encoding: "utf8",
      timeout: 20000,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: home,
        NEOTOMA_DATA_DIR: path.join(home, "data"),
        NO_UPDATE_NOTIFIER: "1",
        CI: "1",
      },
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  helpCache.set(key, out);
  return out;
}

function usageNames(out: string, parts: string[]): boolean {
  const m = /^Usage: neotoma (.*)$/m.exec(out);
  if (!m) return false;
  if (parts.length === 0) return true;
  const last = parts[parts.length - 1]!;
  return new RegExp(`(^|[ |])${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[ |])`).test(m[1]!);
}

interface Invocation {
  doc: string;
  line: number;
  text: string;
}

function extract(doc: string): Invocation[] {
  const lines = readFileSync(path.join(REPO_ROOT, doc), "utf8").split("\n");
  const out: Invocation[] = [];
  let fenceLang: string | null = null;
  lines.forEach((raw, i) => {
    const fence = /^\s*```(\S*)/.exec(raw);
    if (fence) {
      fenceLang = fenceLang === null ? (fence[1] ?? "") : null;
      return;
    }
    if (fenceLang !== null) {
      const s = raw.trim();
      if ((fenceLang === "bash" || fenceLang === "sh") && s.startsWith("neotoma ")) {
        out.push({ doc, line: i + 1, text: s.split(" #")[0]!.trim() });
      }
      return;
    }
    for (const m of raw.matchAll(/`(neotoma [^`]+)`/g)) {
      out.push({ doc, line: i + 1, text: m[1]! });
    }
  });
  return out;
}

function commandPath(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (/^[-<[('"$/~.]/.test(t) || /[=|…*]/.test(t)) break;
    out.push(t);
  }
  return out;
}

function resolve(tokens: string[]): string[] | null {
  const pathTokens = commandPath(tokens);
  for (let k = Math.min(2, pathTokens.length); k >= 0; k--) {
    const candidate = pathTokens.slice(0, k);
    if (pathTokens.length > 0 && k === 0) return null;
    const out = help(candidate);
    if (!usageNames(out, candidate)) continue;
    // A command with subcommands followed by a bare word that is not one of them
    // is a wrong subcommand, not a positional argument.
    if (k === 1 && pathTokens.length > 1 && /^Commands:/m.test(out)) return null;
    return candidate;
  }
  return null;
}

function check(inv: Invocation): string | null {
  let tokens = inv.text.split(/\s+/).slice(1);
  let resolved = resolve(tokens);
  if (!resolved && tokens.length > 0 && ENV_SHORTCUTS.has(tokens[0]!)) {
    tokens = tokens.slice(1);
    resolved = resolve(tokens);
  }
  if (!resolved) return "command path not found";
  const own = help(resolved);
  const root = help([]);
  const flags: string[] = [];
  for (const t of tokens) {
    if (t === "--") break;
    const m = /^(--[a-z][a-z0-9-]*)/.exec(t);
    if (m) flags.push(m[1]!);
  }
  const missing = flags.filter((f) => f !== "--help" && !own.includes(f) && !root.includes(f));
  return missing.length > 0
    ? `unknown flag(s) ${missing.join(", ")} for neotoma ${resolved.join(" ")}`
    : null;
}

describe("docs name only commands and flags the CLI has", () => {
  const invocations = DOCS.flatMap(extract);
  const hitMisses = new Set<string>();

  it("finds invocations to check", () => {
    expect(invocations.length).toBeGreaterThan(200);
  });

  it("every command path and flag exists", () => {
    const problems: string[] = [];
    for (const inv of invocations) {
      const problem = check(inv);
      if (!problem) continue;
      if (inv.text in EXPECTED_MISSES) {
        hitMisses.add(inv.text);
        continue;
      }
      problems.push(`${inv.doc}:${inv.line}: \`${inv.text}\`: ${problem}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  }, 300000);

  it("every expected miss is still needed", () => {
    const stale = Object.keys(EXPECTED_MISSES).filter((k) => !hitMisses.has(k));
    expect(stale).toEqual([]);
  });
});
