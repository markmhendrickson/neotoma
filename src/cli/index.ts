#!/usr/bin/env node
import { Command } from "commander";
import { createHash, randomBytes } from "node:crypto";
import { exec, execSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWriteStream, mkdirSync } from "node:fs";
import { realpathSync } from "node:fs";
import * as readline from "node:readline";

import { config as appConfig } from "../config.js";
import { getMcpAuthToken } from "../crypto/mcp_auth_token.js";
import { createApiClient } from "../shared/api_client.js";
import { getOpenApiOperationMapping } from "../shared/contract_mappings.js";
import { getEntityDisplayName } from "../shared/entity_display_name.js";
import { getRecordDisplaySummary } from "../shared/record_display_summary.js";
import {
  API_LOG_PATH,
  API_LOGS_DIR,
  API_PID_PATH,
  BACKGROUND_SERVERS_PATH,
  CLI_LOG_PATH,
  CONFIG_DIR,
  CONFIG_PATH,
  CANDIDATE_API_PORTS,
  clearConfig,
  detectRunningApiPorts,
  isTokenExpired,
  isProd,
  readConfig,
  resolveBaseUrl,
  waitForApiReady,
  waitForHealth,
  writeConfig,
  type Config,
} from "./config.js";
import {
  getLatestFromRegistry,
  isUpdateAvailable,
  formatUpgradeCommand,
} from "../version_check.js";
import {
  accent,
  black,
  blackBox,
  bold,
  bullet,
  computeBoxInnerWidth,
  dim,
  displayWidth,
  getTerminalWidth,
  heading,
  keyValue,
  nl,
  numbered,
  padToDisplayWidth,
  panel,
  pathStyle,
  subHeading,
  success,
  visibleLength,
  warn,
} from "./format.js";
const CLI_BANNER = `
 ███╗   ██╗███████╗ ██████╗ ████████╗ ██████╗ ███╗   ███╗ █████╗ 
 ████╗  ██║██╔════╝██╔═══██╗╚══██╔══╝██╔═══██╗████╗ ████║██╔══██╗
 ██╔██╗ ██║█████╗  ██║   ██║   ██║   ██║   ██║██╔████╔██║███████║
 ██║╚██╗██║██╔══╝  ██║   ██║   ██║   ██║   ██║██║╚██╔╝██║██╔══██║
 ██║ ╚████║███████╗╚██████╔╝   ██║   ╚██████╔╝██║ ╚═╝ ██║██║  ██║
 ╚═╝  ╚═══╝╚══════╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝
     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
`;

const BANNER_ANIMATION_MS_PER_LETTER = 120;
const BANNER_ANIMATION_MS_BETWEEN_CYCLES = 600;

const ESC = "\u001b";
const BANNER_ANSI = {
  hideCursor: `${ESC}[?25l`,
  showCursor: `${ESC}[?25h`,
  up: (n: number) => `${ESC}[${n}A`,
  down: (n: number) => `${ESC}[${n}B`,
  clearLine: `${ESC}[2K\r`,
  clearLineFull: `${ESC}[2K`,
};

/** Ref object so watch callback can read current line (e.g. { current: "" }). */
type BufferRef = { current: string };

/** Ref for suggestion line count; when set to 0 by external redraw (SIGWINCH), clears are skipped. */
type SuggestionLinesRef = { current: number };

/** Session command history for Up/Down cycling. indexRef.current is the current history index (history.length = new line). */
export type SessionHistoryRef = { history: string[]; indexRef: { current: number } };

const MAX_SESSION_HISTORY = 100;

/**
 * Ask for one line with live "/" command list: when line starts with "/", suggestions
 * (name + description) are shown and updated on every keypress. Uses raw mode.
 * Optional historyRef enables Up/Down to cycle through previous lines.
 */
function askWithLiveSlash(
  prog: Command,
  promptPrefix: string,
  onLine: (line: string | null) => void,
  bufferRef?: BufferRef,
  suggestionLinesRef?: SuggestionLinesRef,
  historyRef?: SessionHistoryRef
): void {
  const stdin = process.stdin;
  const wasPaused = stdin.isPaused();
  if (suggestionLinesRef) suggestionLinesRef.current = 0;
  const useReadline =
    !stdin.isTTY || process.env.NEOTOMA_USE_READLINE === "1" || process.env.NEOTOMA_USE_READLINE === "true";
  if (useReadline) {
    const rl = readline.createInterface({ input: stdin, output: process.stdout });
    if (historyRef && Array.isArray(historyRef.history) && historyRef.history.length > 0) {
      (rl as readline.ReadLine & { history?: string[] }).history = [...historyRef.history];
    }
    rl.question(promptPrefix, (line) => {
      rl.close();
      if (bufferRef) bufferRef.current = "";
      onLine(line?.trim() ?? null);
    });
    return;
  }
  stdin.setRawMode(true);
  stdin.resume();
  let buffer = "";
  const lastSuggestionLinesRef = suggestionLinesRef ?? { current: 0 };
  if (historyRef) {
    historyRef.indexRef.current = historyRef.history.length;
  }
  /** 0 = normal, 1 = saw ESC, 2 = saw ESC [ (expect A/B/C/D). */
  let escapeState: 0 | 1 | 2 = 0;

  /** Redraw prompt line and, when line starts with "/", show command list below so Tab can complete. */
  function redrawSuggestions(): void {
    const toClear = lastSuggestionLinesRef.current;
    if (toClear > 0) {
      for (let i = 0; i < toClear; i++) {
        process.stdout.write(BANNER_ANSI.down(1) + BANNER_ANSI.clearLineFull);
      }
      process.stdout.write(BANNER_ANSI.up(toClear));
    }
    lastSuggestionLinesRef.current = 0;
    process.stdout.write("\r" + BANNER_ANSI.clearLineFull + promptPrefix + buffer);
    const trimmed = buffer.trimStart();
    if (trimmed.startsWith("/")) {
      const filter = trimmed.slice(1).trim();
      const { text, lines } = getSessionCommandsBlock(prog, filter);
      process.stdout.write(text);
      lastSuggestionLinesRef.current = lines;
      process.stdout.write(BANNER_ANSI.up(lines));
    }
  }

  function finish(line: string | null): void {
    stdin.removeListener("data", onData);
    stdin.setRawMode(false);
    if (wasPaused) stdin.pause();
    if (bufferRef) bufferRef.current = "";
    const toClear = lastSuggestionLinesRef.current;
    if (toClear > 0) {
      for (let i = 0; i < toClear; i++) {
        process.stdout.write(BANNER_ANSI.clearLineFull + "\n");
      }
    }
    onLine(line);
  }

  function onData(key: string | Buffer): void {
    const k = typeof key === "string" ? key : key.toString("utf8");
    for (let i = 0; i < k.length; i++) {
      const c = k[i]!;
      if (escapeState === 1) {
        escapeState = c === "[" ? 2 : 0;
        continue;
      }
      if (escapeState === 2) {
        if (c === "A" && historyRef) {
          if (historyRef.history.length > 0) {
            historyRef.indexRef.current = Math.max(0, historyRef.indexRef.current - 1);
            buffer = historyRef.history[historyRef.indexRef.current] ?? "";
            if (bufferRef) bufferRef.current = buffer;
            redrawSuggestions();
          }
        } else if (c === "B" && historyRef) {
          if (historyRef.indexRef.current < historyRef.history.length) {
            historyRef.indexRef.current += 1;
            buffer =
              historyRef.indexRef.current === historyRef.history.length
                ? ""
                : (historyRef.history[historyRef.indexRef.current] ?? "");
            if (bufferRef) bufferRef.current = buffer;
            redrawSuggestions();
          }
        }
        escapeState = 0;
        continue;
      }
      if (c === "\u0003") {
        finish(null);
        return;
      }
      if (c === "\u0004") {
        if (buffer.length === 0) {
          finish(null);
          return;
        }
        continue;
      }
      if (c === "\n" || c === "\r") {
        finish(buffer);
        return;
      }
      if (c === "\b" || c === "\u007f") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          if (bufferRef) bufferRef.current = buffer;
          process.stdout.write("\b \b");
          redrawSuggestions();
        }
        continue;
      }
      if (c === ESC) {
        escapeState = 1;
        continue;
      }
      if (c === "\t") {
        const trimmed = buffer.trimStart();
        if (trimmed.startsWith("/")) {
          const filter = trimmed.slice(1).trim();
          const commands = getSessionCommands(prog, filter);
          if (commands.length > 0) {
            buffer = "/" + commands[0]!.name + " ";
            if (bufferRef) bufferRef.current = buffer;
            redrawSuggestions();
          }
        }
        continue;
      }
      if (c >= " ") {
        if (historyRef) historyRef.indexRef.current = historyRef.history.length;
        buffer += c;
        if (bufferRef) bufferRef.current = buffer;
        process.stdout.write(c);
        redrawSuggestions();
      }
    }
  }

  if (bufferRef) bufferRef.current = "";
  process.stdout.write(promptPrefix);
  stdin.on("data", onData);
}

const SOLID_BLOCK = "\u2588"; // █
const OUTLINE_CHARS = new Set("╔╗╚╝║═");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isSolidBlock(ch: string): boolean {
  return ch === SOLID_BLOCK;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isOutlineChar(ch: string): boolean {
  return OUTLINE_CHARS.has(ch);
}

/** Column ranges (inclusive start, exclusive end) for N E O T O M A. */
const LETTER_COL_RANGES: [number, number][] = [
  [0, 10], // N
  [10, 19], // E
  [19, 27], // O
  [27, 37], // T
  [37, 45], // O
  [45, 52], // M
  [52, 64], // A
];

function letterIndexForColumn(col: number): number {
  for (let i = 0; i < LETTER_COL_RANGES.length; i++) {
    const [start, end] = LETTER_COL_RANGES[i];
    if (col >= start && col < end) return i;
  }
  return 0;
}

type Bounds = { top: number; bottom: number; left: number; right: number };

function outlineCharForPosition(lineIdx: number, charIdx: number, b: Bounds): string {
  const top = lineIdx === b.top;
  const bottom = lineIdx === b.bottom;
  const left = charIdx === b.left;
  const right = charIdx === b.right;
  if (top && left) return "╔";
  if (top && right) return "╗";
  if (bottom && left) return "╚";
  if (bottom && right) return "╝";
  if (top || bottom) return "═";
  if (left || right) return "║";
  return " ";
}

type BannerState = {
  lineCount: number;
  runOneCycle: (alreadyDrawn: boolean) => Promise<void>;
};

function getBannerState(): BannerState {
  const lines = CLI_BANNER.trim().split("\n");
  const lineCount = lines.length;
  const solidByLetter: { lineIdx: number; charIdx: number }[][] = [[], [], [], [], [], [], []];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci] ?? "";
      if (isSolidBlock(ch)) {
        const letter = letterIndexForColumn(ci);
        solidByLetter[letter].push({ lineIdx: li, charIdx: ci });
      }
    }
  }

  const letterBounds: Bounds[] = solidByLetter.map((cells) => {
    if (cells.length === 0) {
      return { top: 0, bottom: 0, left: 0, right: 0 };
    }
    let top = cells[0].lineIdx;
    let bottom = cells[0].lineIdx;
    let left = cells[0].charIdx;
    let right = cells[0].charIdx;
    for (const { lineIdx, charIdx } of cells) {
      if (lineIdx < top) top = lineIdx;
      if (lineIdx > bottom) bottom = lineIdx;
      if (charIdx < left) left = charIdx;
      if (charIdx > right) right = charIdx;
    }
    return { top, bottom, left, right };
  });

  const outlineOnlyLines = lines.map((line) => line.split(""));
  for (let letter = 0; letter < letterBounds.length; letter++) {
    const b = letterBounds[letter];
    for (let r = b.top; r <= b.bottom; r++) {
      for (let c = b.left; c <= b.right; c++) {
        outlineOnlyLines[r][c] = outlineCharForPosition(r, c, b);
      }
    }
  }

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const drawFrame = (solidRevealed: Set<string>, useOutlineOnly: boolean): void => {
    const currentLines = lines.map((line, lineIdx) =>
      line
        .split("")
        .map((ch, charIdx) => {
          if (isSolidBlock(ch)) {
            if (useOutlineOnly) return outlineOnlyLines[lineIdx][charIdx];
            return solidRevealed.has(`${lineIdx},${charIdx}`)
              ? ch
              : outlineOnlyLines[lineIdx][charIdx];
          }
          return ch;
        })
        .join("")
    );
    for (const line of currentLines) {
      process.stdout.write(BANNER_ANSI.clearLine);
      process.stdout.write(line + "\n");
    }
  };

  const runOneCycle = async (alreadyDrawn: boolean): Promise<void> => {
    if (alreadyDrawn) process.stdout.write(BANNER_ANSI.up(lineCount));
    drawFrame(new Set(), true);
    await delay(400);
    const revealed = new Set<string>();
    for (let letter = 0; letter < solidByLetter.length; letter++) {
      process.stdout.write(BANNER_ANSI.up(lineCount));
      for (const { lineIdx, charIdx } of solidByLetter[letter]) {
        revealed.add(`${lineIdx},${charIdx}`);
      }
      drawFrame(revealed, false);
      if (letter < solidByLetter.length - 1) {
        await delay(BANNER_ANIMATION_MS_PER_LETTER);
      }
    }
  };

  return { lineCount, runOneCycle };
}

function clearBanner(lineCount: number): void {
  process.stdout.write(BANNER_ANSI.showCursor);
  process.stdout.write(BANNER_ANSI.up(lineCount));
  for (let i = 0; i < lineCount; i++) {
    process.stdout.write(BANNER_ANSI.clearLine);
    if (i < lineCount - 1) process.stdout.write(BANNER_ANSI.down(1));
  }
}

function runBannerAnimationLoop(): {
  stop: () => void;
  whenStopped: Promise<void>;
  lineCount: number;
} {
  const state = getBannerState();
  let stopped = false;
  let resolveStopped: () => void = () => {};
  const whenStopped = new Promise<void>((r) => {
    resolveStopped = r;
  });
  process.stdout.write(BANNER_ANSI.hideCursor);
  (async () => {
    let alreadyDrawn = false;
    while (!stopped) {
      await state.runOneCycle(alreadyDrawn);
      alreadyDrawn = true;
      if (stopped) break;
      await new Promise((r) => setTimeout(r, BANNER_ANIMATION_MS_BETWEEN_CYCLES));
    }
    resolveStopped();
  })();
  return {
    stop: () => {
      stopped = true;
    },
    whenStopped,
    lineCount: state.lineCount,
  };
}

type OutputMode = "json" | "pretty";

type NpmScript = {
  name: string;
  command: string;
};

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
};

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, val]) => [key, normalizeValue(val)]));
  }

  return value;
}

function createIdempotencyKey(payload: unknown): string {
  const normalized = normalizeValue(payload);
  const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return `idemp_${hash}`;
}

/** Resolve to a real path so we find the repo from subdirs or through symlinks. */
async function resolveStartDir(dir: string): Promise<string> {
  const absolute = path.resolve(dir);
  try {
    return await fs.realpath(absolute);
  } catch {
    return absolute;
  }
}

// Exported for use in mcp_config_scan.ts
export async function findRepoRoot(startDir: string): Promise<string | null> {
  let current = await resolveStartDir(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pkgPath = path.join(current, "package.json");
    try {
      const raw = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as PackageJson;
      if (pkg.name === "neotoma") {
        return current;
      }
    } catch {
      // ignore and walk up
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Returns absolute path if dir is a Neotoma repo, else null. */
async function validateNeotomaRepo(dir: string): Promise<string | null> {
  const candidate = await resolveStartDir(dir);
  const pkgPath = path.join(candidate, "package.json");
  try {
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as PackageJson;
    return pkg.name === "neotoma" ? candidate : null;
  } catch {
    return null;
  }
}

async function loadNpmScripts(): Promise<{ repoRoot: string; scripts: NpmScript[] }> {
  const config = await readConfig();
  let repoRoot: string | null = null;
  if (config.repo_root) {
    repoRoot = await validateNeotomaRepo(config.repo_root);
  }
  if (!repoRoot && process.env.NEOTOMA_REPO_ROOT) {
    repoRoot = await validateNeotomaRepo(process.env.NEOTOMA_REPO_ROOT);
  }
  if (!repoRoot) {
    repoRoot = await findRepoRoot(process.cwd());
  }
  if (!repoRoot) {
    throw new Error(
      "Not a Neotoma repo. Run from the repo root (package.json name must be 'neotoma'), run 'neotoma init' to set repo path, or set NEOTOMA_REPO_ROOT."
    );
  }
  // Auto-persist repo root when we discovered it from cwd or env and config does not have it
  if (!config.repo_root) {
    await writeConfig({ ...config, repo_root: repoRoot });
    process.stderr.write(
      dim("Saved repo path to config: ") + pathStyle(CONFIG_PATH) + "\n"
    );
  }
  const pkgPath = path.join(repoRoot, "package.json");
  const raw = await fs.readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as PackageJson;
  const scripts = Object.entries(pkg.scripts ?? {})
    .map(([name, command]) => ({ name, command }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { repoRoot, scripts };
}

async function runNpmScript(scriptName: string, args: string[]): Promise<never> {
  const { repoRoot } = await loadNpmScripts();
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const scriptArgs = ["run", scriptName, ...(args.length > 0 ? ["--", ...args] : [])];
  const child = spawn(npmCmd, scriptArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env },
  });
  child.on("close", (code) => {
    process.exit(code ?? 1);
  });
  child.on("error", (err) => {
    writeCliError(err);
    process.exit(1);
  });
  return new Promise(() => {});
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return Object.fromEntries(entries.map(([key, val]) => [key, sortKeys(val)]));
  }
  return value;
}

function stableStringify(value: unknown, indent: number): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function resolveOutputMode(): OutputMode {
  const opts = program.opts();
  const json = Boolean(opts.json);
  const pretty = Boolean(opts.pretty);
  if (json && pretty) {
    throw new Error("Use only one of --json or --pretty.");
  }
  return json ? "json" : "pretty";
}

function writeOutput(value: unknown, mode: OutputMode): void {
  const indent = mode === "pretty" ? 2 : 0;
  process.stdout.write(`${stableStringify(value, indent)}\n`);
}

/** Wrap a string to a max display width; returns lines (uses displayWidth for column alignment). */
function wrapByDisplayWidth(str: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [str];
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < str.length; i++) {
    const next = current + str[i];
    if (displayWidth(next) > maxWidth && current.length > 0) {
      lines.push(current);
      current = str[i];
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Format one entity as a two-column table (name, value). Skips missing/undefined.
 * Columns: entity_id (or entity.id), entity_type, canonical_name, snapshot keys (sorted),
 * observation_count, last_observation_at, computed_at.
 * Values wrap within the value column; name column stays fixed.
 */
function formatEntityPropertiesTable(entity: Record<string, unknown>): string {
  const pairs: [string, unknown][] = [];
  const id = entity.entity_id ?? (entity as { id?: unknown }).id;
  if (id !== undefined && id !== null) pairs.push(["entity_id", id]);
  if (entity.entity_type !== undefined && entity.entity_type !== null)
    pairs.push(["entity_type", entity.entity_type]);
  if (entity.canonical_name !== undefined && entity.canonical_name !== null)
    pairs.push(["canonical_name", entity.canonical_name]);
  const snapshot = entity.snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const keys = Object.keys(snapshot as Record<string, unknown>).sort();
    for (const k of keys) {
      const v = (snapshot as Record<string, unknown>)[k];
      if (v !== undefined && v !== null) pairs.push([k, v]);
    }
  }
  if (entity.observation_count !== undefined && entity.observation_count !== null)
    pairs.push(["observation_count", entity.observation_count]);
  if (entity.last_observation_at !== undefined && entity.last_observation_at !== null)
    pairs.push(["last_observation_at", entity.last_observation_at]);
  if (entity.computed_at !== undefined && entity.computed_at !== null)
    pairs.push(["computed_at", entity.computed_at]);
  const nameColWidth = pairs.length ? Math.max(...pairs.map(([k]) => displayWidth(k))) : 0;
  const gap = 2;
  const termWidth = typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const valueColWidth = Math.max(10, termWidth - nameColWidth - gap);
  const prefix = " ".repeat(nameColWidth + gap);
  const out: string[] = [];
  for (const [name, val] of pairs) {
    if (val === undefined || val === null) continue;
    const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
    const wrapped = wrapByDisplayWidth(valStr, valueColWidth);
    const namePadded = padToDisplayWidth(name, nameColWidth);
    out.push(namePadded + "  " + (wrapped[0] ?? ""));
    for (let i = 1; i < wrapped.length; i++) {
      out.push(prefix + wrapped[i]);
    }
  }
  return out.join("\n");
}

type RelationshipRow = {
  relationship_type?: string;
  source_entity_id?: string;
  target_entity_id?: string;
  [key: string]: unknown;
};

/** Format outgoing/incoming relationships for pretty display (column-aligned, wrap values). Always shows section. */
function formatRelationshipsSection(rels: {
  outgoing?: RelationshipRow[];
  incoming?: RelationshipRow[];
}): string {
  const lines: string[] = [""];
  lines.push(subHeading("Relationships"));
  const termWidth = typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const typeCol = 14;
  const idCol = Math.max(24, Math.min(48, Math.floor((termWidth - typeCol - 4) / 2)));
  const fmt = (type: string, source: string, target: string): string => {
    const typePadded = padToDisplayWidth(type.slice(0, typeCol), typeCol);
    const srcShort = source.length > idCol ? source.slice(0, idCol - 2) + "…" : source;
    const tgtShort = target.length > idCol ? target.slice(0, idCol - 2) + "…" : target;
    return typePadded + "  " + padToDisplayWidth(srcShort, idCol) + "  " + tgtShort;
  };
  const header = fmt("relationship_type", "source_entity_id", "target_entity_id");
  const outCount = rels.outgoing?.length ?? 0;
  const inCount = rels.incoming?.length ?? 0;
  if (outCount > 0) {
    lines.push(dim("Outgoing:"));
    lines.push(dim(header));
    for (const r of rels.outgoing ?? []) {
      lines.push(
        fmt(
          String(r.relationship_type ?? ""),
          String(r.source_entity_id ?? ""),
          String(r.target_entity_id ?? "")
        )
      );
    }
  } else {
    lines.push(dim("Outgoing: none"));
  }
  if (inCount > 0) {
    lines.push("");
    lines.push(dim("Incoming:"));
    lines.push(dim(header));
    for (const r of rels.incoming ?? []) {
      lines.push(
        fmt(
          String(r.relationship_type ?? ""),
          String(r.source_entity_id ?? ""),
          String(r.target_entity_id ?? "")
        )
      );
    }
  } else {
    lines.push(dim("Incoming: none"));
  }
  return lines.join("\n");
}

function writeMessage(message: string, mode: OutputMode): void {
  if (mode === "json") {
    writeOutput({ message }, mode);
    return;
  }
  console.log(message);
}

/** Turn raw fetch/network errors into a short, human-readable message.
 * @param sessionContext - When true, message assumes API was just started by CLI (suggests session log). */
function humanReadableApiError(err: unknown, sessionContext?: boolean): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && "cause" in err && (err.cause as NodeJS.ErrnoException)?.code;
  if (
    msg === "fetch failed" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    msg.includes("ECONNRESET")
  ) {
    if (sessionContext) {
      return (
        "Server not reachable. API may still be starting. Check data/logs/session-dev.log or session-prod.log. " +
        "Retry with `neotoma --env=prod` if the server crashed."
      );
    }
    return "Server not reachable. Is the API running? Try `neotoma api start`. If the API is on port 8180 (e.g. npm run dev:prod), use --base-url http://localhost:8180";
  }
  if (code === "ENOTFOUND") {
    return "Host not found. Check --base-url.";
  }
  if (msg.includes("timeout") || (err instanceof Error && err.name === "AbortError")) {
    return "Request timed out.";
  }
  return msg;
}

function formatCliError(err: unknown): string {
  const human = humanReadableApiError(err);
  let detail: string | undefined;
  if (err instanceof Error && err.cause) {
    const c = err.cause as NodeJS.ErrnoException & { message?: string };
    if (typeof c.message === "string" && c.message) detail = c.message;
    else if (c.code) detail = String(c.code);
  }
  if (detail) return `${human} (${detail})`;
  return human;
}

export function writeCliError(err: unknown): void {
  const msg = formatCliError(err);
  if (process.stdout.isTTY) process.stderr.write("\n");
  process.stderr.write(`neotoma: ${msg}\n`);
}

function formatApiError(error: unknown): string {
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.detail === "string") return o.detail;
    if (typeof o.error === "string") return o.error;
    if (Array.isArray(o.detail) && o.detail.length > 0) {
      const first = o.detail[0];
      if (first && typeof first === "object" && "msg" in first)
        return String((first as { msg: unknown }).msg);
    }
  }
  return String(error);
}

function parseOptionalJson(value?: string): unknown {
  if (!value) {
    return undefined;
  }
  return JSON.parse(value);
}

function openBrowser(url: string): void {
  const quoted = `"${url.replace(/"/g, "%22")}"`;
  if (process.platform === "darwin") {
    exec(`open ${quoted}`);
    return;
  }
  if (process.platform === "win32") {
    exec(`start "" ${quoted}`);
    return;
  }
  exec(`xdg-open ${quoted}`);
}

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildCodeChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier).digest();
  return base64UrlEncode(digest);
}

export function buildOAuthAuthorizeUrl(params: {
  baseUrl: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  clientId: string;
  devStub?: boolean;
}): string {
  const authUrl = new URL(`${params.baseUrl}/api/mcp/oauth/authorize`);
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("state", params.state);
  authUrl.searchParams.set("code_challenge", params.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("client_id", params.clientId);
  if (params.devStub) {
    authUrl.searchParams.set("dev_stub", "1");
  }
  return authUrl.toString();
}

async function startOAuthCallbackServer(): Promise<{
  redirectUri: string;
  waitForCode: Promise<{ code: string; state: string }>;
}> {
  return new Promise((resolve, reject) => {
    let resolveCode: (value: { code: string; state: string }) => void;
    const waitForCode = new Promise<{ code: string; state: string }>((innerResolve) => {
      resolveCode = innerResolve;
    });

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Missing callback URL");
        return;
      }
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      if (requestUrl.pathname !== "/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      if (!code || !state) {
        res.statusCode = 400;
        res.end("Missing code or state");
        return;
      }
      res.statusCode = 200;
      res.end("Authentication complete. You can close this tab.");
      server.close();
      resolveCode({ code, state });
    });

    server.on("error", (error) => {
      reject(error);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start callback server"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${address.port}/callback`;
      resolve({ redirectUri, waitForCode });
    });
  });
}

async function exchangeToken(
  baseUrl: string,
  code: string
): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);

  const response = await fetch(`${baseUrl}/api/mcp/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  return (await response.json()) as {
    access_token: string;
    token_type?: string;
    expires_in?: number;
  };
}

/**
 * Run the OAuth PKCE login flow and write config. Used by auth login and by ensureSessionOrAuth.
 */
async function runLoginFlow(baseUrl: string, devStub: boolean = false): Promise<void> {
  const state = base64UrlEncode(randomBytes(16));
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = buildCodeChallenge(verifier);
  const { redirectUri, waitForCode } = await startOAuthCallbackServer();
  const authUrl = buildOAuthAuthorizeUrl({
    baseUrl,
    redirectUri,
    state,
    codeChallenge: challenge,
    clientId: "neotoma-cli",
    devStub,
  });
  const outputMode = resolveOutputMode();
  writeMessage("Opening browser for authorization...", outputMode);
  if (outputMode !== "json") {
    process.stderr.write("Waiting for you to complete sign-in in the browser...\n");
  }
  openBrowser(authUrl);
  const { code, state: returnedState } = await waitForCode;
  if (returnedState !== state) {
    throw new Error("OAuth state mismatch");
  }
  const token = await exchangeToken(baseUrl, code);
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : undefined;
  await writeConfig({
    base_url: baseUrl,
    access_token: token.access_token,
    token_type: token.token_type,
    expires_at: expiresAt,
    connection_id: code,
  });
  writeMessage("Authentication successful.", outputMode);
}

/**
 * Ensure we have an active session; if GET /api/me returns 401 and we're in a TTY, run OAuth login.
 * When encryption is off and no token is sent, the API accepts the request as default user (no login needed).
 * Retries up to 3 times to tolerate brief server restarts (e.g. during tsx/tsc watch).
 */
async function ensureSessionOrAuth(baseUrl: string): Promise<void> {
  let token: string | undefined;
  try {
    token = await getCliToken();
  } catch {
    token = undefined;
  }
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const maxAttempts = 3;
  const retryDelayMs = 1200;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return;
      if (res.status === 401 && process.stdout.isTTY) {
        process.stderr.write("No active session. Signing in...\n");
        await runLoginFlow(baseUrl, false);
      }
      return;
    } catch (err) {
      if (attempt < maxAttempts) {
        debugLog(`Session fetch attempt ${attempt} failed, retrying in ${retryDelayMs}ms`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Resolve CLI auth token using same patterns as MCP.
 * Encryption off: NEOTOMA_BEARER_TOKEN only, or no token (API treats no Bearer as dev-local).
 * Encryption on: key-derived token (requires NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC).
 */
async function getCliToken(): Promise<string | undefined> {
  if (appConfig.encryption.enabled) {
    const token = getMcpAuthToken();
    if (!token) {
      throw new Error(
        "Encryption is enabled but no key configured. Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC."
      );
    }
    return token;
  }
  if (process.env.NEOTOMA_BEARER_TOKEN) return process.env.NEOTOMA_BEARER_TOKEN;
  return undefined;
}

/** Three mice in nest (plain ASCII). Line-art style: dense nest, circular opening, three mice. */
const NEST_ART_PLAIN = [
  "         \\/\\  /\\  \\/\\",
  "        /  \\/  \\/  \\  \\",
  "       / \\/  ^o^  \\/  \\",
  "      (  \\/  \\/ ( ) \\/  )",
  "       \\ ^o^ \\/  \\/  /",
  "        \\/  \\/  \\/  \\/",
  "          \\/ ( ) \\/",
  "           \\/ ^o^ \\/     Truth layer for AI memory",
  "            \\_____/",
].join("\n");

/** Nest + mice art: accent for nest/mice, dim for tagline. */
function nestArt(): string {
  const tagline = "Truth layer for AI memory";
  return NEST_ART_PLAIN.split("\n")
    .map((line) => {
      if (line.includes(tagline)) {
        const before = line.slice(0, line.indexOf(tagline)).trimEnd();
        return accent(before) + "  " + dim(tagline);
      }
      return accent(line);
    })
    .join("\n");
}

/** Check API health; returns status for display in intro. */
async function checkApiStatusForIntro(): Promise<{
  ok: boolean;
  baseUrl?: string;
  latencyMs?: number;
  error?: string;
}> {
  try {
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    const healthUrl = `${baseUrl}/health`;
    const start = Date.now();
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { ok?: boolean };
    const ok = res.ok && data.ok === true;
    return { ok, baseUrl, latencyMs: Date.now() - start };
  } catch (err) {
    const config = await readConfig().catch(() => ({}) as Config);
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    return {
      ok: false,
      baseUrl,
      error: humanReadableApiError(err),
    };
  }
}

/** Thrown when a command calls process.exit() during session so we can keep the REPL running. */
class SessionExit extends Error {
  constructor(public code: number) {
    super("SessionExit");
    this.name = "SessionExit";
  }
}

/** Wait for session port file written by API when it binds; returns actual port or preferred on timeout. */
async function waitForSessionPortFile(
  portFilePath: string,
  preferredPort: number,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = await fs.readFile(portFilePath, "utf-8");
      const p = parseInt(raw.trim(), 10);
      if (Number.isFinite(p) && p > 0 && p <= 65535) return p;
    } catch {
      // file not ready
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return preferredPort;
}

/** Pick two free ports for dev and prod (avoids collision when multiple `neotoma` instances run). */
async function pickSessionPorts(repoRoot: string): Promise<[number, number]> {
  const scriptPath = path.join(repoRoot, "scripts", "pick-port.js");
  try {
    const out = execSync(`node "${scriptPath}" 8080 8180`, {
      encoding: "utf-8",
      cwd: repoRoot,
    }).trim();
    const parts = out.split(/\s+/);
    const a = parseInt(parts[0] ?? "", 10);
    const b = parseInt(parts[1] ?? "", 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) {
      throw new Error("pick-port.js did not return two ports");
    }
    return [a, b];
  } catch (err) {
    throw new Error(
      "Failed to pick session ports. Ensure you are in the Neotoma repo and scripts/pick-port.js exists. " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WATCH_CONCURRENTLY_ARGS = [
  "--kill-others-on-fail=false",
  "--restart-tries=0",
  "--timestamp=HH:mm:ss",
  "--prefix={time} [{name}]",
  "--names=api   ,build",
  "tsx watch src/actions.ts",
  "tsc --watch",
];

/** Same as above but with HTTPS tunnel + server + build (dev/prod each get own tunnel via NGROK_*_FILE). */
const WATCH_CONCURRENTLY_ARGS_TUNNEL = [
  "--kill-others-on-fail=false",
  "--restart-tries=0",
  "--timestamp=HH:mm:ss",
  "--prefix={time} [{name}]",
  "--names=tunnel,api   ,build",
  "bash scripts/setup-https-tunnel.sh",
  "bash scripts/run-dev-server-with-tunnel-url.sh",
  "tsc --watch",
];

const TUNNEL_DEV_URL_FILE = "/tmp/ngrok-mcp-dev-url.txt";
const TUNNEL_DEV_PID_FILE = "/tmp/ngrok-mcp-dev.pid";
const TUNNEL_PROD_URL_FILE = "/tmp/ngrok-mcp-prod-url.txt";
const TUNNEL_PROD_PID_FILE = "/tmp/ngrok-mcp-prod.pid";

/** Tunnel URL, PID, and log paths under repo data/logs (consolidated with session and CLI logs). */
function getTunnelUrlFile(repoRoot: string, env: "dev" | "prod"): string {
  return path.join(repoRoot, "data", "logs", env === "dev" ? "tunnel-dev-url.txt" : "tunnel-prod-url.txt");
}
function getTunnelPidFile(repoRoot: string, env: "dev" | "prod"): string {
  return path.join(repoRoot, "data", "logs", env === "dev" ? "tunnel-dev.pid" : "tunnel-prod.pid");
}
/** Path to tunnel script stdout/stderr log (setup-https-tunnel.sh writes NGROK_URL_FILE with .txt → .log). */
function getTunnelLogPath(repoRoot: string, env: "dev" | "prod"): string {
  return path.join(repoRoot, "data", "logs", env === "dev" ? "tunnel-dev-url.log" : "tunnel-prod-url.log");
}

const TUNNEL_POLL_MS = 1200;
const TUNNEL_POLL_ATTEMPTS = 10;

/** Poll tunnel URL files; returns { dev, prod } with base URLs or null. Uses repo data/logs when repoRoot given, else /tmp fallback. */
async function readTunnelUrls(repoRoot?: string | null): Promise<{ dev: string | null; prod: string | null }> {
  const devFile = repoRoot ? getTunnelUrlFile(repoRoot, "dev") : TUNNEL_DEV_URL_FILE;
  const prodFile = repoRoot ? getTunnelUrlFile(repoRoot, "prod") : TUNNEL_PROD_URL_FILE;
  async function readOne(file: string): Promise<string | null> {
    for (let i = 0; i < TUNNEL_POLL_ATTEMPTS; i++) {
      try {
        const raw = await fs.readFile(file, "utf-8");
        const url = raw.trim();
        if (url) return url.replace(/\/$/, "");
      } catch {
        // not ready
      }
      await new Promise((r) => setTimeout(r, TUNNEL_POLL_MS));
    }
    return null;
  }
  const [dev, prod] = await Promise.all([readOne(devFile), readOne(prodFile)]);
  return { dev, prod };
}

/** Infer tunnel service name from URL (matches setup-https-tunnel.sh providers). */
function tunnelServiceFromUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("trycloudflare.com")) return "Cloudflare";
  if (u.includes("ngrok")) return "ngrok";
  return "tunnel";
}

/** Write Dev and Prod sections; each shows Local MCP and Tunnel MCP URLs only. */
async function _writeServerUrlSections(devPort: number, prodPort: number): Promise<void> {
  const { dev: devUrl, prod: prodUrl } = process.stdout.isTTY
    ? await runWithSpinner("Loading tunnel URLs…", readTunnelUrls)
    : await readTunnelUrls();

  process.stdout.write(subHeading("Dev") + "\n");
  process.stdout.write(dim("Local:  ") + pathStyle(`http://127.0.0.1:${devPort}/mcp`) + "\n");
  if (devUrl) {
    const svc = tunnelServiceFromUrl(devUrl);
    process.stdout.write(dim("Tunnel: ") + pathStyle(`${devUrl}/mcp`) + dim(` (${svc})`) + "\n");
  } else {
    process.stdout.write(
      dim("Tunnel: not ready (check server output or ") +
        pathStyle("/tmp/ngrok-mcp-dev-url.txt") +
        dim(")") +
        "\n"
    );
  }
  process.stdout.write("\n");

  process.stdout.write(subHeading("Prod") + "\n");
  process.stdout.write(dim("Local:  ") + pathStyle(`http://127.0.0.1:${prodPort}/mcp`) + "\n");
  if (prodUrl) {
    const svc = tunnelServiceFromUrl(prodUrl);
    process.stdout.write(dim("Tunnel: ") + pathStyle(`${prodUrl}/mcp`) + dim(` (${svc})`) + "\n");
  } else {
    process.stdout.write(
      dim("Tunnel: not ready (check server output or ") +
        pathStyle("/tmp/ngrok-mcp-prod-url.txt") +
        dim(")") +
        "\n"
    );
  }
  process.stdout.write("\n");
}

/** Spawn dev and prod API + build watch processes; optionally with HTTPS tunnel. Caller must kill them on session exit. */
function _spawnDevProdServers(
  repoRoot: string,
  devPort: number,
  prodPort: number,
  withTunnel: boolean
): { dev: ReturnType<typeof spawn>; prod: ReturnType<typeof spawn> } {
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = withTunnel ? WATCH_CONCURRENTLY_ARGS_TUNNEL : WATCH_CONCURRENTLY_ARGS;
  const devEnv = {
    ...process.env,
    HTTP_PORT: String(devPort),
    ...(withTunnel && {
      TUNNEL_NONINTERACTIVE: "1",
      NGROK_URL_FILE: TUNNEL_DEV_URL_FILE,
      NGROK_PID_FILE: TUNNEL_DEV_PID_FILE,
    }),
  };
  const prodEnv = {
    ...process.env,
    HTTP_PORT: String(prodPort),
    NEOTOMA_ENV: "production",
    ...(withTunnel && {
      TUNNEL_NONINTERACTIVE: "1",
      NGROK_URL_FILE: TUNNEL_PROD_URL_FILE,
      NGROK_PID_FILE: TUNNEL_PROD_PID_FILE,
    }),
  };
  const devChild = spawn(npxCmd, ["concurrently", ...args], {
    cwd: repoRoot,
    stdio: "pipe",
    env: devEnv,
    shell: false,
  });
  const prodChild = spawn(npxCmd, ["concurrently", ...args], {
    cwd: repoRoot,
    stdio: "pipe",
    env: prodEnv,
    shell: false,
  });
  devChild.on("error", (err) => {
    process.stderr.write(`neotoma: dev server error: ${err.message}\n`);
  });
  prodChild.on("error", (err) => {
    process.stderr.write(`neotoma: prod server error: ${err.message}\n`);
  });
  return { dev: devChild, prod: prodChild };
}

/** Background servers state written by --background and read by stop. */
type BackgroundServersState = {
  devPid: number;
  prodPid: number;
  devPort: number;
  prodPort: number;
  repoRoot: string;
  startedAt: string;
};

/** Spawn dev and prod servers detached (background); optionally with tunnel. Returns PIDs; caller writes state file and exits. */
function spawnDevProdServersDetached(
  repoRoot: string,
  devPort: number,
  prodPort: number,
  withTunnel: boolean
): { devPid: number; prodPid: number } {
  if (withTunnel) {
    try {
      mkdirSync(path.join(repoRoot, "data", "logs"), { recursive: true });
    } catch {
      // ignore
    }
  }
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = withTunnel ? WATCH_CONCURRENTLY_ARGS_TUNNEL : WATCH_CONCURRENTLY_ARGS;
  const devEnv = {
    ...process.env,
    HTTP_PORT: String(devPort),
    ...(withTunnel && {
      TUNNEL_NONINTERACTIVE: "1",
      NGROK_URL_FILE: getTunnelUrlFile(repoRoot, "dev"),
      NGROK_PID_FILE: getTunnelPidFile(repoRoot, "dev"),
    }),
  };
  const prodEnv = {
    ...process.env,
    HTTP_PORT: String(prodPort),
    NEOTOMA_ENV: "production",
    ...(withTunnel && {
      TUNNEL_NONINTERACTIVE: "1",
      NGROK_URL_FILE: getTunnelUrlFile(repoRoot, "prod"),
      NGROK_PID_FILE: getTunnelPidFile(repoRoot, "prod"),
    }),
  };
  const devChild = spawn(npxCmd, ["concurrently", ...args], {
    cwd: repoRoot,
    stdio: "ignore",
    env: devEnv,
    shell: false,
    detached: true,
  });
  const prodChild = spawn(npxCmd, ["concurrently", ...args], {
    cwd: repoRoot,
    stdio: "ignore",
    env: prodEnv,
    shell: false,
    detached: true,
  });
  devChild.unref();
  prodChild.unref();
  return {
    devPid: devChild.pid ?? 0,
    prodPid: prodChild.pid ?? 0,
  };
}

/** Parse a line into argv-style tokens; respects double-quoted segments. */
function parseSessionLine(line: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && (c === " " || c === "\t")) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += c;
  }
  if (current) args.push(current);
  return args;
}

type CommandRow = { indent: number; name: string; description: string };

function getCmdName(cmd: Command): string {
  return (typeof cmd.name === "function" ? cmd.name() : "") || "";
}
function getCmdDescription(cmd: Command): string {
  return (typeof cmd.description === "function" ? cmd.description() : "") || "";
}

/** Get session commands and subcommands as flat rows (indent 0 = top-level, 2 = subcommand), optionally filtered. */
function getSessionCommandsWithSubcommands(prog: Command, filter?: string): CommandRow[] {
  const f = filter?.trim().toLowerCase() ?? "";
  const rows: CommandRow[] = [];
  const cmds = prog.commands;
  for (const cmd of cmds) {
    const name = getCmdName(cmd);
    const description = getCmdDescription(cmd);
    if (!name || name.startsWith(" ")) continue;
    const subRows: CommandRow[] = cmd.commands
      .map((sub) => ({
        indent: 2,
        name: getCmdName(sub),
        description: getCmdDescription(sub),
      }))
      .filter((s) => s.name && !s.name.startsWith(" "));
    const topMatches =
      !f ||
      name.toLowerCase().includes(f) ||
      (description && description.toLowerCase().includes(f));
    const anySubMatches =
      !f ||
      subRows.some(
        (s) =>
          s.name.toLowerCase().includes(f) ||
          (s.description && s.description.toLowerCase().includes(f))
      );
    if (topMatches || anySubMatches) {
      rows.push({ indent: 0, name, description });
      if (anySubMatches || !f) {
        const toShow = !f
          ? subRows
          : subRows.filter(
              (s) =>
                s.name.toLowerCase().includes(f) ||
                (s.description && s.description.toLowerCase().includes(f))
            );
        rows.push(...toShow);
      }
    }
  }
  return rows;
}

/** Get top-level session commands (name + description), optionally filtered by substring. */
function getSessionCommands(
  prog: Command,
  filter?: string
): { name: string; description: string }[] {
  return getSessionCommandsWithSubcommands(prog, filter)
    .filter((r) => r.indent === 0)
    .map((r) => ({ name: r.name, description: r.description }));
}

/** Completer for readline: when line starts with "/", return matching command names so Tab shows autocomplete. */
function _sessionCompleter(prog: Command, line: string): [string[], string] {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("/")) return [[], ""];
  const filter = trimmed.slice(1).trim();
  const commands = getSessionCommands(prog, filter);
  const names = commands.map((c) => c.name);
  return [names, filter];
}

/** Return command list as table text and line count (for live redraw). */
function getSessionCommandsBlock(prog: Command, filter?: string): { text: string; lines: number } {
  const commands = getSessionCommands(prog, filter);
  if (commands.length === 0) {
    const msg = dim("No commands match. Type ") + pathStyle("/") + dim(" to see all.") + "\n\n";
    return { text: msg, lines: 2 };
  }
  const nameWidth = Math.max(...commands.map((c) => displayWidth(c.name)), displayWidth("Command"));
  const gap = "  ";
  const lineArr: string[] = [];
  lineArr.push(dim("Commands (type name to run):"));
  lineArr.push("");
  lineArr.push(bold(padToDisplayWidth("Command", nameWidth)) + gap + bold("Description"));
  lineArr.push(dim("-".repeat(nameWidth) + gap + "-".repeat(11)));
  for (const c of commands) {
    lineArr.push(padToDisplayWidth(pathStyle(c.name), nameWidth) + gap + dim(c.description));
  }
  lineArr.push("");
  const text = lineArr.join("\n") + "\n";
  return { text, lines: lineArr.length };
}

/** Print command list as a table (name + description) for session "/" palette. */
function printSessionCommands(prog: Command, filter?: string): void {
  const { text } = getSessionCommandsBlock(prog, filter);
  process.stdout.write(text);
}

const program = new Command();
program
  .name("neotoma")
  .description("Neotoma CLI")
  .option("--base-url <url>", "API base URL (default: auto-detect 8180 or 8080)")
  .option("--json", "Output machine-readable JSON")
  .option("--pretty", "Output formatted JSON for humans")
  .option(
    "--no-session",
    "With no args: show intro then command menu (>); no servers"
  )
  .option("--no-servers", "With no args: use existing API only (no start). Same as --servers=use-existing.")
  .option(
    "--servers <policy>",
    "Server policy: start (start API if needed) or use-existing (connect only; fail if unreachable). Non-TTY defaults to use-existing."
  )
  .option(
    "--background",
    "With no args: start dev and prod servers in background and exit (stop with neotoma stop)"
  )
  .option(
    "--env <env>",
    "Preferred environment for this run: dev or prod (overrides config when starting session)"
  )
  .option(
    "--tunnel",
    "Start HTTPS tunnel (ngrok/cloudflared) with dev/prod servers; off by default"
  )
  .option("--debug", "Show detailed initialization logs when starting session")
  .option(
    "--log-file <path>",
    "Append CLI stdout and stderr to this file (dev default: repo data/logs/cli.<pid>.log when in a repo, else ~/.config/neotoma/cli.<pid>.log)"
  )
  .option("--no-log-file", "Do not append CLI output to the log file (no-op in prod)")
  .option("--no-update-check", "Disable update availability check");

function isDebug(): boolean {
  return Boolean((program.opts() as { debug?: boolean }).debug);
}

function debugLog(msg: string): void {
  if (isDebug()) process.stderr.write(dim(`[debug] ${msg}\n`));
}

/** Show global options (flags) via a command so they are discoverable in-session (e.g. type "options"). */
program
  .command("options")
  .description("Show global options (flags) for neotoma")
  .action(() => {
    const outputMode = resolveOutputMode();
    const opts = program.options;
    if (outputMode === "json") {
      writeOutput(
        { options: opts.map((o) => ({ flags: o.flags, description: o.description })) },
        outputMode
      );
      return;
    }
    process.stdout.write(heading("Global options") + nl() + nl());
    for (const opt of opts) {
      process.stdout.write(keyValue(opt.flags, opt.description, true) + "\n");
    }
    process.stdout.write(
      nl() + dim("Use with: ") + pathStyle("neotoma [options] [command]") + nl()
    );
  });

// No preAction auth validation: CLI uses MCP-style auth (key-derived or no token),
// not stored OAuth. auth login remains for MCP Connect (Cursor) setup.

// ── Session (interactive REPL) ─────────────────────────────────────────────

/** Ask a y/n question; returns true for y/yes, false otherwise. */
function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "y" || a === "yes");
    });
  });
}

/** Ask for a single line of input; returns trimmed string or empty. */
function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Server policy: start (spawn API if needed) or use-existing (connect only). */
type ServerPolicy = "start" | "use-existing";

/** Resolve server policy: flags, config, non-TTY default, or TTY prompt. Persists choice when user is prompted. Only offers "Use existing" when at least one API is reachable. */
async function resolveServerPolicy(
  noServers: boolean,
  serversOpt: string | undefined
): Promise<ServerPolicy> {
  if (noServers) return "use-existing";
  const v = String(serversOpt ?? "").toLowerCase();
  if (v === "start" || v === "use-existing") return v as ServerPolicy;
  if (!process.stdout.isTTY) return "use-existing";
  const config = await readConfig();
  if (config.server_policy === "start" || config.server_policy === "use-existing") {
    return config.server_policy;
  }
  const runningPorts = await detectRunningApiPorts();
  const sortedPorts = [...runningPorts].sort((a, b) => a - b);
  process.stdout.write("\n" + bold("API servers") + "\n");
  process.stdout.write(
    dim("  1) Start – start API for this session if needed (dev or prod)\n")
  );
  if (sortedPorts.length > 0) {
    const portList = sortedPorts.map((p) => `${p} (${p === 8180 ? "prod" : "dev"})`).join(", ");
    process.stdout.write(
      dim(`  2) Use existing – connect to one of: ${portList}\n`)
    );
  }
  const prompt = sortedPorts.length > 0 ? dim("  [1/2] > ") : dim("  [1] > ");
  const answer = await askQuestion(prompt);
  const choice =
    sortedPorts.length > 0 &&
    (answer.trim() === "2" || answer.toLowerCase().startsWith("e") || answer.toLowerCase().includes("existing"))
      ? "use-existing"
      : "start";
  config.server_policy = choice;
  await writeConfig(config);
  return choice;
}

/** Session watch: stream of DB changes when in session. Toggled by watch command. */
type WatchEvent = {
  ts: string;
  table: string;
  id: string;
  summary: string;
  actionLabel: string;
  /** Entity type for tables that reference entities (e.g. contact, company). Omitted for live watch. */
  entityType?: string;
  /** Optional IDs from the row for "view details": entity get, sources get, relationships list. */
  entity_id?: string;
  source_entity_id?: string;
  target_entity_id?: string;
  from_entity_id?: string;
  to_entity_id?: string;
  source_id?: string;
};

type SessionWatchState = {
  enabled: boolean;
  /** Last N events for live time-ago refresh (no env, human labels). */
  liveLines: WatchEvent[];
  /** Callback set by session loop so watch toggle can restart with same behavior. */
  onEvent: (event: WatchEvent) => void;
  stop: () => void;
  repoRoot: string;
  preferredEnv: "dev" | "prod";
  userId: string | null;
  refreshIntervalId: ReturnType<typeof setInterval> | null;
};
let sessionWatchState: SessionWatchState | null = null;

/** Current watch display for SIGWINCH redraw. Set when watch turns on, cleared when off. */
let sessionWatchDisplayRef: { watchLines: string[]; watchEventCount: number } | null = null;

const WATCH_LIVE_MAX = 20;

/** Wait for user to press Enter or q then Enter to exit watch mode. Uses raw stdin (same as session prompt) so the next prompt's raw mode and Tab completion keep working. */
function runWatchModeExit(): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || !stdin.setRawMode) {
      const rl = readline.createInterface({ input: stdin, output: process.stdout });
      rl.question("", () => {
        rl.close();
        stdin.resume();
        resolve();
      });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    let _buffer = "";
    function done(): void {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      resolve();
    }
    function onData(key: string | Buffer): void {
      const k = typeof key === "string" ? key : key.toString("utf8");
      for (let i = 0; i < k.length; i++) {
        const c = k[i]!;
        if (c === "\u0003") {
          done();
          return;
        }
        if (c === "\n" || c === "\r") {
          done();
          return;
        }
        if (c === "q" || c === "Q") {
          _buffer = "q";
          continue;
        }
        if (c >= " ") _buffer += c;
      }
    }
    stdin.on("data", onData);
  });
}

/** Human-readable "time ago" from an ISO timestamp (compact format, fits Time column). */
function timeAgo(iso: string, ref: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const now = ref.getTime();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/** Human-readable action labels per table (no env). */
const TABLE_ACTION_LABEL: Record<string, string> = {
  sources: "Source added",
  entities: "Entity created",
  observations: "Observation created",
  relationship_observations: "Relationship observation created",
  timeline_events: "Timeline event created",
  interpretations: "Interpretation run",
  entity_snapshots: "Entity snapshot computed",
  raw_fragments: "Raw fragment created",
  entity_merges: "Entities merged",
  relationship_snapshots: "Relationship snapshot computed",
};

const WATCH_ID_MAX = 24;

const WATCH_TABLE_COLUMNS = {
  num: 3,
  time: 14,
  type: 14,
  action: 28,
  id: 24,
  summary: 44,
} as const;
const WATCH_TABLE_GAP = "  ";

function truncateToDisplayWidth(s: string, maxWidth: number): string {
  if (displayWidth(s) <= maxWidth) return s;
  let len = s.length;
  while (len > 0 && displayWidth(s.slice(0, len) + "…") > maxWidth) len--;
  return (s.slice(0, len) || s.slice(0, 1)) + "…";
}

/** Last N watch events shown in the Recent events box; used so session REPL can interpret row numbers (e.g. "3") as "view details for row 3". */
let lastShownWatchEvents: WatchEvent[] | null = null;

/** Format watch events as a table (# | Time | Type | Action | ID | Summary). Returns lines including header and separator. Row numbers 1..N allow "view details" by entering the number at the prompt. */
function formatWatchTable(events: WatchEvent[], ref: Date): string[] {
  if (events.length === 0) return [];
  const { num: wNum, time: wTime, type: wType, action: wAction, id: wId, summary: wSummary } =
    WATCH_TABLE_COLUMNS;
  const header =
    bold(padToDisplayWidth("#", wNum)) +
    WATCH_TABLE_GAP +
    bold(padToDisplayWidth("Time", wTime)) +
    WATCH_TABLE_GAP +
    bold(padToDisplayWidth("Type", wType)) +
    WATCH_TABLE_GAP +
    bold(padToDisplayWidth("Action", wAction)) +
    WATCH_TABLE_GAP +
    bold(padToDisplayWidth("ID", wId)) +
    WATCH_TABLE_GAP +
    bold("Summary");
  const sep =
    dim("-".repeat(wNum)) +
    WATCH_TABLE_GAP +
    dim("-".repeat(wTime)) +
    WATCH_TABLE_GAP +
    dim("-".repeat(wType)) +
    WATCH_TABLE_GAP +
    dim("-".repeat(wAction)) +
    WATCH_TABLE_GAP +
    dim("-".repeat(wId)) +
    WATCH_TABLE_GAP +
    dim("-".repeat(wSummary));
  const rows = events.map((e, i) => {
    const numStr = String(i + 1);
    const ago = truncateToDisplayWidth(timeAgo(e.ts, ref), wTime);
    const typeStr = e.entityType ?? "-";
    const typeShort = truncateToDisplayWidth(typeStr, wType);
    const actionShort = truncateToDisplayWidth(e.actionLabel, wAction);
    const idShort = truncateToDisplayWidth(e.id, wId);
    const summaryShort = truncateToDisplayWidth(e.summary, wSummary);
    return (
      dim(padToDisplayWidth(numStr, wNum)) +
      WATCH_TABLE_GAP +
      dim(padToDisplayWidth(ago, wTime)) +
      WATCH_TABLE_GAP +
      dim(padToDisplayWidth(typeShort, wType)) +
      WATCH_TABLE_GAP +
      dim(padToDisplayWidth(actionShort, wAction)) +
      WATCH_TABLE_GAP +
      dim(padToDisplayWidth(idShort, wId)) +
      WATCH_TABLE_GAP +
      dim(summaryShort)
    );
  });
  return [header, sep, ...rows];
}

function _formatWatchLiveLine(e: WatchEvent, ref: Date): string {
  const ago = timeAgo(e.ts, ref);
  const idShort =
    displayWidth(e.id) > WATCH_ID_MAX
      ? e.id.slice(0, Math.min(e.id.length, WATCH_ID_MAX - 1)) + "…"
      : e.id;
  const summaryShort = displayWidth(e.summary) > 44 ? e.summary.slice(0, 41) + "…" : e.summary;
  return dim(`${ago.padEnd(16)}  ${e.actionLabel}  ${idShort}  ${summaryShort}`);
}

/** Start background watch for dev + prod DBs; call onEvent for each change. Returns stop(). */
async function startSessionWatch(
  repoRoot: string,
  onEvent: (event: WatchEvent) => void,
  preferredEnv: "dev" | "prod" = "dev"
): Promise<() => void> {
  const dataDir = path.join(repoRoot, "data");
  const dbFile = preferredEnv === "prod" ? "neotoma.prod.db" : "neotoma.db";
  const dbPath = path.join(dataDir, dbFile);
  const WATCH_TABLE_DEFS = [
    { table: "sources", idCol: "id", tsCol: "created_at" },
    { table: "entities", idCol: "id", tsCol: "created_at" },
    { table: "observations", idCol: "id", tsCol: "created_at" },
    { table: "relationship_observations", idCol: "id", tsCol: "created_at" },
    { table: "timeline_events", idCol: "id", tsCol: "created_at" },
    {
      table: "interpretations",
      idCol: "id",
      tsCol: "started_at",
      userFilter: "source_user" as const,
    },
    { table: "entity_snapshots", idCol: "entity_id", tsCol: "computed_at" },
    { table: "raw_fragments", idCol: "id", tsCol: "created_at" },
    { table: "entity_merges", idCol: "id", tsCol: "created_at" },
    { table: "relationship_snapshots", idCol: "relationship_key", tsCol: "computed_at" },
  ];
  const _TABLE_EMOJI: Record<string, string> = {
    sources: "📄",
    entities: "👤",
    observations: "👁️",
    relationship_observations: "🔗",
    timeline_events: "📅",
    interpretations: "🔄",
    entity_snapshots: "📊",
    raw_fragments: "📝",
    entity_merges: "🔀",
    relationship_snapshots: "🔗",
  };
  let userId = "";
  const sessionPort =
    process.env[preferredEnv === "dev" ? "NEOTOMA_SESSION_DEV_PORT" : "NEOTOMA_SESSION_PROD_PORT"];
  if (sessionPort) {
    try {
      const token = await getCliToken();
      const res = await fetch(`http://127.0.0.1:${sessionPort}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const me = (await res.json()) as { user_id?: string };
        if (me.user_id) userId = me.user_id;
      }
    } catch {
      // ignore
    }
  }
  type DbInstance = {
    close: () => void;
    prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
    pragma: (s: string) => void;
  };
  const sqlite3Mod = await import("better-sqlite3");
  const Database = (sqlite3Mod as unknown as { default: new (path: string) => DbInstance }).default;
  const dbs: { path: string; label: string; db: DbInstance; cursors: Record<string, string> }[] =
    [];
  const nowIso = new Date().toISOString();
  try {
    await fs.access(dbPath);
    const db = new Database(dbPath);
    db.pragma("busy_timeout = 2000");
    const cursors: Record<string, string> = {};
    for (const { table } of WATCH_TABLE_DEFS) cursors[table] = nowIso;
    dbs.push({ path: dbPath, label: preferredEnv, db, cursors });
  } catch {
    // Database file not found
  }
  if (dbs.length === 0) return () => {};

  function fetchEntityNames(
    db: DbInstance,
    entityIds: Set<string>,
    forUserId: string
  ): Map<string, string> {
    const map = new Map<string, string>();
    if (entityIds.size === 0 || !forUserId) return map;
    try {
      const placeholders = Array.from(entityIds)
        .map(() => "?")
        .join(",");
      const stmt = db.prepare(
        `SELECT id, canonical_name, entity_type FROM entities WHERE id IN (${placeholders}) AND user_id = ?`
      );
      const rows = stmt.all(...entityIds, forUserId) as {
        id: string;
        canonical_name: string;
        entity_type?: string;
      }[];
      for (const r of rows) map.set(r.id, r.canonical_name);
    } catch {
      // ignore
    }
    return map;
  }

  /** Entity id -> entity_type for Type column and entity_merges. */
  function fetchEntityTypes(
    db: DbInstance,
    entityIds: Set<string>,
    forUserId: string
  ): Map<string, string> {
    const map = new Map<string, string>();
    if (entityIds.size === 0 || !forUserId) return map;
    try {
      const placeholders = Array.from(entityIds)
        .map(() => "?")
        .join(",");
      const stmt = db.prepare(
        `SELECT id, entity_type FROM entities WHERE id IN (${placeholders}) AND user_id = ?`
      );
      const rows = stmt.all(...entityIds, forUserId) as { id: string; entity_type: string }[];
      for (const r of rows) if (r.entity_type) map.set(r.id, r.entity_type);
    } catch {
      // ignore
    }
    return map;
  }

  /** Derive type string for watch Type column from table and row. */
  function typeForRow(
    table: string,
    row: Record<string, unknown>,
    entityTypes: Map<string, string>
  ): string {
    const str = (k: string) => (row[k] != null ? String(row[k]).trim() : "");
    if (table === "entities") return str("entity_type") || "entity";
    if (table === "observations") return str("entity_type") || entityTypes.get(str("entity_id")) || "-";
    if (table === "entity_snapshots") return str("entity_type") || entityTypes.get(str("entity_id")) || "-";
    if (table === "raw_fragments") return str("entity_type") || "-";
    if (table === "timeline_events") return str("event_type") || "event";
    if (table === "relationship_observations" || table === "relationship_snapshots")
      return str("relationship_type") || "relationship";
    if (table === "entity_merges")
      return entityTypes.get(str("from_entity_id")) || entityTypes.get(str("to_entity_id")) || "merge";
    if (table === "sources") return str("mime_type") || "source";
    if (table === "interpretations") return "interpretation";
    return "-";
  }
  function collectEntityIds(table: string, rows: Record<string, unknown>[]): Set<string> {
    const ids = new Set<string>();
    for (const row of rows) {
      const add = (k: string) => {
        const val = row[k];
        if (val && typeof val === "string") ids.add(val);
      };
      if (table === "observations") add("entity_id");
      else if (table === "relationship_observations" || table === "relationship_snapshots") {
        add("source_entity_id");
        add("target_entity_id");
      } else if (table === "entity_snapshots") add("entity_id");
      else if (table === "entity_merges") {
        add("from_entity_id");
        add("to_entity_id");
      }
    }
    return ids;
  }
  function formatSummary(
    table: string,
    row: Record<string, unknown>,
    entityNames: Map<string, string>
  ): string {
    const name = (id: string) => entityNames.get(id) ?? id.slice(0, 12) + "…";
    return getRecordDisplaySummary(table, row, { getEntityDisplayName: name });
  }

  // Dedupe entity_snapshots: same entity_id can be updated many times in quick succession
  // (e.g. one store triggering repeated snapshot writes). Only emit once per entity per window.
  const ENTITY_SNAPSHOT_EMIT_WINDOW_MS = 2000;
  const lastEmittedEntitySnapshot: Record<string, number> = {};

  function pollOne(db: DbInstance, cursors: Record<string, string>): void {
    for (const { table, idCol, tsCol, userFilter } of WATCH_TABLE_DEFS) {
      try {
        const cursor = cursors[table] ?? "1970-01-01T00:00:00Z";
        const userClause =
          userFilter === "source_user"
            ? "source_id IN (SELECT id FROM sources WHERE user_id = ?)"
            : "user_id = ?";
        const stmt = db.prepare(
          `SELECT * FROM ${table} WHERE ${tsCol} IS NOT NULL AND ${tsCol} > ? AND ${userClause} ORDER BY ${tsCol} ASC LIMIT 100`
        );
        const rows = stmt.all(cursor, userId) as Record<string, unknown>[];
        const entityIds = collectEntityIds(table, rows);
        const entityNames = fetchEntityNames(db, entityIds, userId);
        const entityTypes = fetchEntityTypes(db, entityIds, userId);
        for (const row of rows) {
          const ts = String(row[tsCol] ?? "");
          if (ts && (!cursors[table] || ts > cursors[table])) cursors[table] = ts;
          const id = String(row[idCol] ?? "");
          const summary = formatSummary(table, row, entityNames);
          const actionLabel = TABLE_ACTION_LABEL[table] ?? table;
          const entityType = typeForRow(table, row, entityTypes);
          const isEntitySnapshot = table === "entity_snapshots";
          const now = Date.now();
          if (isEntitySnapshot && id) {
            const last = lastEmittedEntitySnapshot[id];
            if (last != null && now - last < ENTITY_SNAPSHOT_EMIT_WINDOW_MS) {
              continue; // Skip duplicate emit for same entity within window
            }
            lastEmittedEntitySnapshot[id] = now;
          }
          onEvent({
            ts,
            table,
            id,
            summary,
            actionLabel,
            entityType,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("no such table")) {
          process.stderr.write(`neotoma watch: ${table}: ${msg}\n`);
        }
      }
    }
  }

  const intervalMs = 400;
  const id = setInterval(() => {
    for (const { db, cursors } of dbs) pollOne(db, cursors);
  }, intervalMs);
  return () => {
    clearInterval(id);
    for (const { db } of dbs) db.close();
  };
}

/** Run the interactive session REPL. Optional onExit is called when the user exits (exit/quit/Ctrl+D). */
/** Pack-rat themed ready phrases; rotated each time the session prompt is shown. */
const SESSION_READY_PHRASES = [
  "Nest is warm!",
  "Ready to hoard knowledge!",
  "Burrow open for business!",
  "Den is ready!",
  "Ready to stash some data!",
  "Hoarding mode: on!",
  "Cache is warm!",
  "Ready to collect!",
  "Pack rat at your service!",
  "Nest is ready for treasures!",
];
let sessionReadyPhraseIndex = 0;

type RedrawStatusBlockFn = (currentBuffer: string) => void;

async function runSessionLoop(opts?: {
  onExit?: () => void;
  repoRoot?: string;
  preferredEnv?: "dev" | "prod";
  userId?: string | null;
  redrawStatusBlock?: RedrawStatusBlockFn;
  statusBlockLineCount?: number;
  suggestionLinesRef?: SuggestionLinesRef;
  lastReadyPhraseRef?: { current: string };
}): Promise<void> {
  const realExit = process.exit.bind(process);
  process.exit = ((code?: number) => {
    throw new SessionExit(code ?? 0);
  }) as typeof process.exit;

  const lineBufferRef: BufferRef = { current: "" };
  const suggestionLinesRef = opts?.suggestionLinesRef ?? { current: 0 };
  const lastReadyPhraseRef = opts?.lastReadyPhraseRef ?? { current: SESSION_READY_PHRASES[0]! };
  const sessionHistory: string[] = [];
  const historyIndexRef = { current: 0 };
  const historyRef: SessionHistoryRef = { history: sessionHistory, indexRef: historyIndexRef };
  let exited = false;
  function doExit(): void {
    if (exited) return;
    exited = true;
    sigwinchCleanup?.();
    if (sessionWatchState) {
      if (sessionWatchState.refreshIntervalId) clearInterval(sessionWatchState.refreshIntervalId);
      sessionWatchState.stop();
      sessionWatchState = null;
    }
    opts?.onExit?.();
    realExit(0);
  }

  process.stdin.on("close", () => doExit());

  if (opts?.repoRoot) {
    const preferredEnv: "dev" | "prod" = opts.preferredEnv ?? "dev";
    const state: SessionWatchState = {
      enabled: false,
      liveLines: [],
      onEvent: () => {},
      stop: () => {},
      repoRoot: opts.repoRoot,
      preferredEnv,
      userId: opts.userId ?? null,
      refreshIntervalId: null,
    };
    state.onEvent = (event) => {
      if (!state.enabled) return;
      state.liveLines.push(event);
      if (state.liveLines.length > WATCH_LIVE_MAX) state.liveLines.shift();
      const line = _formatWatchLiveLine(event, new Date());
      process.stdout.write(
        "\r" + BANNER_ANSI.clearLineFull + "\n" + line + "\n" + bold("neotoma> ") + lineBufferRef.current
      );
    };
    sessionWatchState = state;
  }

  const prompt = () => {
    suggestionLinesRef.current = 0;
    historyIndexRef.current = sessionHistory.length;
    const phrase = SESSION_READY_PHRASES[sessionReadyPhraseIndex++ % SESSION_READY_PHRASES.length];
    lastReadyPhraseRef.current = phrase;
    process.stdout.write(
      success("●") + " " + dim(phrase) + " " + dim("Type / for commands. Up/Down: history.") + "\n"
    );
    askWithLiveSlash(program, bold("neotoma> "), onLine, lineBufferRef, suggestionLinesRef, historyRef);
  };

  let sigwinchCleanup: (() => void) | undefined;
  if (
    process.stdout.isTTY &&
    opts?.redrawStatusBlock != null &&
    opts?.statusBlockLineCount != null &&
    opts.statusBlockLineCount > 0
  ) {
    let debounceId: ReturnType<typeof setTimeout> | undefined;
    const onResize = (): void => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        debounceId = undefined;
        suggestionLinesRef.current = 0;
        const baseLines = opts.statusBlockLineCount! + 1;
        const rows = typeof process.stdout.rows === "number" ? process.stdout.rows : 100;
        const totalLines = Math.max(baseLines, rows - 1);
        process.stdout.write(BANNER_ANSI.up(totalLines));
        process.stdout.write("\x1b[0J");
        opts.redrawStatusBlock!(lineBufferRef.current);
        const readyLine =
          success("●") + " " + dim(lastReadyPhraseRef.current) + " " + dim("Type / for commands.");
        process.stdout.write("\n" + readyLine + "\n");
        process.stdout.write(bold("neotoma> ") + lineBufferRef.current);
      }, 100);
    };
    process.on("SIGWINCH", onResize);
    sigwinchCleanup = () => {
      process.removeListener("SIGWINCH", onResize);
      if (debounceId) clearTimeout(debounceId);
    };
  }

  async function onLine(line: string | null): Promise<void> {
    if (line == null) {
      doExit();
      return;
    }
    const trimmed = line.trim();
    if (trimmed !== "" && trimmed !== "exit" && trimmed !== "quit") {
      const last = sessionHistory[sessionHistory.length - 1];
      if (last !== trimmed) {
        sessionHistory.push(trimmed);
        if (sessionHistory.length > MAX_SESSION_HISTORY) sessionHistory.shift();
      }
    }
    if (trimmed === "" || trimmed === "exit" || trimmed === "quit") {
      if (trimmed === "exit" || trimmed === "quit") {
        doExit();
        return;
      }
      prompt();
      return;
    }
    if (trimmed === "help") {
      program.outputHelp();
      prompt();
      return;
    }
    if (trimmed.startsWith("/")) {
      const afterSlash = trimmed.slice(1).trim();
      if (afterSlash.length === 0) {
        printSessionCommands(program, undefined);
        prompt();
        return;
      }
      const args = parseSessionLine(afterSlash);
      if (args.length > 0) {
        const argv = [process.argv[0], process.argv[1], ...args];
        process.stdout.write("\n");
        try {
          await program.parseAsync(argv);
        } catch (err) {
          if (err instanceof SessionExit) {
            process.exitCode = err.code;
          } else {
            writeCliError(err);
            process.exitCode = 1;
          }
        }
        prompt();
        return;
      }
      printSessionCommands(program, afterSlash);
      prompt();
      return;
    }

    const rowNum = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : 0;
    if (rowNum >= 1) {
      if (!lastShownWatchEvents || lastShownWatchEvents.length === 0) {
        process.stdout.write(
          dim("  No recent events. Run ") +
            pathStyle("watch") +
            dim(" to see recent events; then enter 1–N to view details.") +
            "\n"
        );
        prompt();
        return;
      }
      if (rowNum > lastShownWatchEvents.length) {
        process.stdout.write(
          dim("  Enter a row number between 1 and " + lastShownWatchEvents.length + " to view details.") +
            "\n"
        );
        prompt();
        return;
      }
    }
    if (
      rowNum >= 1 &&
      lastShownWatchEvents &&
      rowNum <= lastShownWatchEvents.length
    ) {
      const event = lastShownWatchEvents[rowNum - 1]!;
      let argv: string[] | null = null;
      if (event.table === "entities") {
        argv = [process.argv[0], process.argv[1], "entities", "get", event.id];
      } else if (event.table === "sources") {
        argv = [process.argv[0], process.argv[1], "sources", "get", event.id];
      } else if (event.table === "timeline_events") {
        argv = [process.argv[0], process.argv[1], "timeline", "list"];
        try {
          await program.parseAsync(argv);
        } catch (err) {
          if (err instanceof SessionExit) {
            process.exitCode = err.code;
          } else {
            writeCliError(err);
            process.exitCode = 1;
          }
        }
        process.stdout.write(
          dim("  Event ID: ") + event.id + dim(" (use timeline list output to find it)") + "\n"
        );
        prompt();
        return;
      } else if (
        (event.table === "entity_snapshots" ||
          event.table === "observations" ||
          event.table === "raw_fragments"      ) &&
        event.entity_id
      ) {
        argv = [process.argv[0], process.argv[1], "entities", "get", event.entity_id];
      } else if (
        (event.table === "relationship_observations" ||
          event.table === "relationship_snapshots") &&
        event.source_entity_id
      ) {
        argv = [
          process.argv[0],
          process.argv[1],
          "relationships",
          "list",
          event.source_entity_id,
        ];
      } else if (event.table === "entity_merges" && event.to_entity_id) {
        argv = [process.argv[0], process.argv[1], "entities", "get", event.to_entity_id];
      } else if (event.table === "interpretations" && event.source_id) {
        argv = [process.argv[0], process.argv[1], "sources", "get", event.source_id];
      }
      if (argv !== null) {
        const entityIdForFallback =
          event.table === "entities"
            ? event.id
            : event.entity_id ?? event.to_entity_id;
        const isEntityGet =
          argv[2] === "entities" && argv[3] === "get" && typeof entityIdForFallback === "string";
        process.stdout.write("\n");
        try {
          await program.parseAsync(argv);
        } catch (err) {
          if (err instanceof SessionExit) {
            process.exitCode = err.code;
          } else {
            const errMsg = err instanceof Error ? err.message : String(err);
            const is404EntityNotFound =
              isEntityGet &&
              (errMsg.includes("404") || errMsg.includes("Entity not found"));
            if (
              is404EntityNotFound &&
              opts?.repoRoot &&
              opts?.preferredEnv &&
              opts?.userId &&
              entityIdForFallback
            ) {
              const localEntity = await getEntityFromLocalDb(
                opts.repoRoot,
                opts.preferredEnv,
                opts.userId,
                entityIdForFallback
              );
              if (localEntity) {
                process.stdout.write(
                  dim("  (from local DB; API returned 404 — API may use a different backend)\n\n")
                );
                process.stdout.write(
                  formatEntityPropertiesTable(localEntity as Record<string, unknown>) + "\n"
                );
              } else {
                writeCliError(err);
                process.stdout.write(
                  dim("  Recent events are from local DB. If the API uses a different backend, the entity may exist only locally.\n")
                );
                process.exitCode = 1;
              }
            } else {
              writeCliError(err);
              process.exitCode = 1;
            }
          }
        }
        prompt();
        return;
      }
      process.stdout.write(
        dim("  ID: " + event.id + " — run neotoma " + event.table.replace(/_/g, " ") + " for list.") + "\n"
      );
      prompt();
      return;
    }

    const args = parseSessionLine(trimmed);
    const argv = [process.argv[0], process.argv[1], ...args];
    process.stdout.write("\n");
    try {
      await program.parseAsync(argv);
    } catch (err) {
      if (err instanceof SessionExit) {
        process.exitCode = err.code;
      } else {
        writeCliError(err);
        process.exitCode = 1;
      }
    }
    prompt();
  }

  prompt();
}

/** Command menu: prompt "> " with hint. Typing help shows commands; / filters them. Otherwise run as neotoma command. */
async function runCommandMenuLoop(): Promise<void> {
  const realExit = process.exit.bind(process);
  process.exit = ((code?: number) => {
    throw new SessionExit(code ?? 0);
  }) as typeof process.exit;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let exited = false;
  function doExit(): void {
    if (exited) return;
    exited = true;
    realExit(0);
  }

  const ask = () => {
    process.stdout.write(dim("Type / for commands.") + "\n");
    askWithLiveSlash(program, bold("> "), onLine);
  };
  rl.on("close", () => doExit());

  async function onLine(line: string | null): Promise<void> {
    if (line == null) {
      rl.close();
      doExit();
      return;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "exit" || trimmed === "quit") {
      if (trimmed === "exit" || trimmed === "quit") {
        rl.close();
        doExit();
        return;
      }
      ask();
      return;
    }
    if (trimmed === "help") {
      program.outputHelp();
      ask();
      return;
    }
    if (trimmed.startsWith("/")) {
      const afterSlash = trimmed.slice(1).trim();
      if (afterSlash.length === 0) {
        printSessionCommands(program, undefined);
        ask();
        return;
      }
      const args = parseSessionLine(afterSlash);
      if (args.length > 0) {
        const argv = [process.argv[0], process.argv[1], ...args];
        process.stdout.write("\n");
        try {
          await program.parseAsync(argv);
        } catch (err) {
          if (err instanceof SessionExit) {
            process.exitCode = err.code;
          } else {
            writeCliError(err);
            process.exitCode = 1;
          }
        }
        ask();
        return;
      }
      printSessionCommands(program, afterSlash);
      ask();
      return;
    }

    const args = parseSessionLine(trimmed);
    const argv = [process.argv[0], process.argv[1], ...args];
    process.stdout.write("\n");
    try {
      await program.parseAsync(argv);
    } catch (err) {
      if (err instanceof SessionExit) {
        process.exitCode = err.code;
      } else {
        writeCliError(err);
        process.exitCode = 1;
      }
    }
    ask();
  }

  ask();
}

program
  .command("servers")
  .description(
    "Show server URLs and tunnel status for the preferred environment (when running in a session with servers)"
  )
  .action(async () => {
    const sessionEnv = process.env.NEOTOMA_SESSION_ENV;
    const preferredEnv: "dev" | "prod" =
      sessionEnv === "dev" || sessionEnv === "prod" ? sessionEnv : "dev";
    const portEnvVar =
      preferredEnv === "dev" ? "NEOTOMA_SESSION_DEV_PORT" : "NEOTOMA_SESSION_PROD_PORT";
    const portStr = process.env[portEnvVar];

    if (portStr == null) {
      process.stdout.write(
        dim("No server running in this session. Start with ") +
          pathStyle("neotoma") +
          dim(" (no args).") +
          "\n"
      );
      return;
    }

    const port = parseInt(portStr, 10);
    if (Number.isNaN(port)) {
      process.stdout.write(
        dim("Invalid session port env. Start a new session with ") + pathStyle("neotoma") + ".\n"
      );
      return;
    }

    // Read tunnel URL for preferred environment
    const tunnelFile = preferredEnv === "dev" ? TUNNEL_DEV_URL_FILE : TUNNEL_PROD_URL_FILE;
    let tunnelUrl: string | null = null;
    try {
      const raw = await fs.readFile(tunnelFile, "utf-8");
      tunnelUrl = raw.trim() || null;
    } catch {
      // Tunnel not ready
    }

    const envName = preferredEnv === "dev" ? "Dev" : "Prod";
    process.stdout.write(subHeading(envName) + "\n");
    process.stdout.write(dim("Local:  ") + pathStyle(`http://127.0.0.1:${port}/mcp`) + "\n");
    if (tunnelUrl) {
      const svc = tunnelServiceFromUrl(tunnelUrl);
      process.stdout.write(
        dim("Tunnel: ") + pathStyle(`${tunnelUrl}/mcp`) + dim(` (${svc})`) + "\n"
      );
    } else {
      process.stdout.write(
        dim("Tunnel: not ready (check server output or ") + pathStyle(tunnelFile) + dim(")") + "\n"
      );
    }
    process.stdout.write("\n");
  });

// ── Init Command ──────────────────────────────────────────────────────────

program
  .command("init")
  .description(
    "Initialize Neotoma for first-time use (create directories, database, optional encryption keys)"
  )
  .option("--data-dir <path>", "Data directory path (default: ./data or ~/neotoma/data)")
  .option("--generate-keys", "Generate encryption keys for privacy-first mode")
  .option("--force", "Overwrite existing configuration")
  .option("--skip-db", "Skip database initialization")
  .action(
    async (opts: {
      dataDir?: string;
      generateKeys?: boolean;
      force?: boolean;
      skipDb?: boolean;
    }) => {
      const outputMode = resolveOutputMode();

      // Resolve repo root so we can persist it and add to .env.example
      const repoRoot = await findRepoRoot(process.cwd());

      // Determine data directory
      let dataDir = opts.dataDir;
      if (!dataDir) {
        if (repoRoot) {
          dataDir = path.join(repoRoot, "data");
        } else {
          const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
          dataDir = path.join(homeDir, "neotoma", "data");
        }
      }

      const steps: {
        name: string;
        status: "done" | "skipped" | "created" | "exists";
        path?: string;
      }[] = [];

      // 1. Create data directories
      const dirs = [
        dataDir,
        path.join(dataDir, "sources"),
        path.join(dataDir, "events"),
        path.join(dataDir, "logs"),
      ];

      for (const dir of dirs) {
        try {
          await fs.access(dir);
          steps.push({ name: path.basename(dir) || "data", status: "exists", path: dir });
        } catch {
          await fs.mkdir(dir, { recursive: true });
          steps.push({ name: path.basename(dir) || "data", status: "created", path: dir });
        }
      }

      // 2. Initialize SQLite database
      const dbPath = path.join(dataDir, "neotoma.db");
      if (!opts.skipDb) {
        try {
          await fs.access(dbPath);
          if (opts.force) {
            // Import and initialize database
            const { default: Database } = await import("better-sqlite3");
            const db = new Database(dbPath);
            db.pragma("journal_mode = WAL");
            db.close();
            steps.push({ name: "database", status: "done", path: dbPath });
          } else {
            steps.push({ name: "database", status: "exists", path: dbPath });
          }
        } catch {
          // Create new database
          const { default: Database } = await import("better-sqlite3");
          const db = new Database(dbPath);
          db.pragma("journal_mode = WAL");
          db.close();
          steps.push({ name: "database", status: "created", path: dbPath });
        }
      } else {
        steps.push({ name: "database", status: "skipped" });
      }

      // 3. Generate encryption keys (optional)
      let keyPath: string | undefined;
      if (opts.generateKeys) {
        const keysDir = path.join(dataDir, "..", "keys");
        keyPath = path.join(keysDir, "neotoma.key");

        try {
          await fs.access(keyPath);
          if (opts.force) {
            await fs.mkdir(keysDir, { recursive: true });
            const keyBytes = randomBytes(32);
            await fs.writeFile(keyPath, keyBytes.toString("hex"), { mode: 0o600 });
            steps.push({ name: "encryption-key", status: "created", path: keyPath });
          } else {
            steps.push({ name: "encryption-key", status: "exists", path: keyPath });
          }
        } catch {
          await fs.mkdir(keysDir, { recursive: true });
          const keyBytes = randomBytes(32);
          await fs.writeFile(keyPath, keyBytes.toString("hex"), { mode: 0o600 });
          steps.push({ name: "encryption-key", status: "created", path: keyPath });
        }
      }

      // 4. Create .env.example if it doesn't exist
      const envExamplePath = path.join(dataDir, "..", ".env.example");
      const repoRootEnvLine = repoRoot
        ? `# Repo root (allows starting servers from any cwd)\nNEOTOMA_REPO_ROOT=${repoRoot}\n\n`
        : "# Optional: set to Neotoma repo path to start servers from any cwd\n# NEOTOMA_REPO_ROOT=/path/to/neotoma\n\n";
      const envContent = `# Neotoma Environment Configuration
# Copy to .env and customize

${repoRootEnvLine}# Storage backend: local or supabase
NEOTOMA_STORAGE_BACKEND=local

# Data directory (defaults to ./data)
NEOTOMA_DATA_DIR=${dataDir}

# SQLite database path (local backend only)
NEOTOMA_SQLITE_PATH=${dbPath}

# Environment: development or production
NEOTOMA_ENV=development

# HTTP API port
HTTP_PORT=8080

# Encryption (optional - for privacy-first mode)
# NEOTOMA_ENCRYPTION_ENABLED=true
# NEOTOMA_KEY_FILE_PATH=${keyPath || "~/.neotoma/keys/neotoma.key"}

# OpenAI API key (for LLM-based extraction)
# OPENAI_API_KEY=sk-...
`;

      try {
        await fs.access(envExamplePath);
        steps.push({ name: ".env.example", status: "exists", path: envExamplePath });
      } catch {
        await fs.writeFile(envExamplePath, envContent);
        steps.push({ name: ".env.example", status: "created", path: envExamplePath });
      }

      // 5. MCP config scan (project-local)
      let mcpScan: {
        configs: { path: string; hasDev: boolean; hasProd: boolean }[];
        repoRoot: string | null;
      } = {
        configs: [],
        repoRoot: null,
      };
      try {
        const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
        mcpScan = await scanForMcpConfigs(repoRoot ?? process.cwd());
      } catch {
        // Non-fatal; init succeeds without MCP scan
      }
      const mcpMissingAny =
        mcpScan.configs.some((c) => !c.hasDev || !c.hasProd) || mcpScan.configs.length === 0;

      // Output results
      if (outputMode === "json") {
        const nextSteps = [
          "Copy .env.example to .env and configure",
          "Start the API: neotoma api start",
          "Configure MCP: neotoma mcp config",
        ];
        if (mcpMissingAny) {
          nextSteps.push("Run neotoma mcp check to scan and add dev/prod servers to MCP configs");
        }
        writeOutput(
          {
            success: true,
            data_dir: dataDir,
            steps,
            mcp_scan: {
              configs: mcpScan.configs.map((c) => ({
                path: c.path,
                has_dev: c.hasDev,
                has_prod: c.hasProd,
              })),
              repo_root: mcpScan.repoRoot,
              missing_any: mcpMissingAny,
            },
            next_steps: nextSteps,
          },
          outputMode
        );
        return;
      }

      process.stdout.write(nl() + heading("Neotoma initialized!") + nl() + nl());
      process.stdout.write(heading("Setup steps") + nl());
      for (const step of steps) {
        const statusText =
          step.status === "created"
            ? success("created")
            : step.status === "exists"
              ? dim("exists")
              : step.status === "skipped"
                ? dim("skipped")
                : success("done");
        const pathPart = step.path ? " " + pathStyle(`(${step.path})`) : "";
        process.stdout.write(bullet(`${step.name}: ${statusText}${pathPart}`) + "\n");
      }
      process.stdout.write(nl());
      process.stdout.write(heading("Next steps") + nl());
      process.stdout.write(numbered(1, "Copy .env.example to .env and configure") + "\n");
      process.stdout.write(numbered(2, "Start the API: " + pathStyle("neotoma api start")) + "\n");
      process.stdout.write(
        numbered(3, "Configure MCP for Cursor: " + pathStyle("neotoma mcp config")) + "\n"
      );

      if (opts.generateKeys && keyPath) {
        process.stdout.write(nl() + heading("Encryption enabled") + nl());
        process.stdout.write(keyValue("Key file", keyPath, true) + "\n");
        process.stdout.write(
          bullet("Add to .env: " + pathStyle("NEOTOMA_ENCRYPTION_ENABLED=true")) + "\n"
        );
        process.stdout.write(
          bullet("Add to .env: " + pathStyle("NEOTOMA_KEY_FILE_PATH=" + keyPath)) + "\n"
        );
        process.stdout.write(
          nl() + warn("Back up your key file. Data cannot be recovered without it.") + nl()
        );
      }

      // MCP config: offer to add dev/prod servers if scan found configs missing them
      if (mcpMissingAny && mcpScan.repoRoot) {
        try {
          const { offerInstall } = await import("./mcp_config_scan.js");
          await offerInstall(mcpScan.configs, mcpScan.repoRoot);
        } catch {
          process.stdout.write(
            nl() +
              dim("Run ") +
              pathStyle("neotoma mcp check") +
              dim(" later to scan and add dev/prod servers to your MCP configs.") +
              nl()
          );
        }
      }

      // Persist repo root so "neotoma" can start servers from any cwd
      let configRepoRoot = repoRoot ?? (await readConfig()).repo_root;
      // In pretty mode (not json), ask for repo root if not found
      if (!configRepoRoot && outputMode === "pretty") {
        const pathInput = await askQuestion(
          "Path to Neotoma repo (optional, for running " +
            pathStyle("neotoma") +
            " from any directory): "
        );
        if (pathInput) {
          const validated = await validateNeotomaRepo(pathInput);
          if (validated) configRepoRoot = validated;
        }
      }
      if (configRepoRoot) {
        const config = await readConfig();
        await writeConfig({ ...config, repo_root: configRepoRoot });
      }

      process.stdout.write(nl());
    }
  );

const authCommand = program.command("auth").description("Authentication commands");

const authLoginCommand = authCommand
  .command("login")
  .description("Login using OAuth PKCE")
  .option("--dev-stub", "Use local dev stub authentication (local backend only)")
  .action(async () => {
    const config = await readConfig();
    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
    const loginOptions = authLoginCommand.opts();
    await runLoginFlow(baseUrl, Boolean(loginOptions.devStub));
  });

authCommand
  .command("status")
  .description("Show authentication status and user details")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
    let token: string | undefined;
    try {
      token = await getCliToken();
    } catch (err) {
      writeMessage(formatCliError(err), outputMode);
      process.exitCode = 1;
      return;
    }
    const status: Record<string, unknown> = {
      base_url: baseUrl,
      connection_id: config.connection_id,
      auth_mode: appConfig.encryption.enabled ? "key-derived" : token ? "dev-token" : "none",
    };
    if (config.expires_at) status.expires_at = config.expires_at;
    if (config.access_token) status.token_expired = isTokenExpired(config);
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}/api/me`, { headers });
      if (res.ok) {
        const me = (await res.json()) as { user_id?: string; email?: string };
        if (me.user_id) status.user_id = me.user_id;
        if (me.email != null) status.email = me.email;
      }
    } catch {
      // Omit user details if /api/me fails (e.g. server unreachable)
    }
    writeOutput(status, outputMode);
  });

authCommand
  .command("logout")
  .description("Clear local auth credentials")
  .action(async () => {
    const outputMode = resolveOutputMode();
    await clearConfig();
    writeMessage("Credentials cleared.", outputMode);
  });

authCommand
  .command("mcp-token")
  .description(
    "Print MCP auth token derived from your private key (when encryption is enabled). Add to mcp.json: headers.Authorization = 'Bearer <token>'"
  )
  .action(async () => {
    const outputMode = resolveOutputMode();
    const keyFilePath = process.env.NEOTOMA_KEY_FILE_PATH || "";
    const mnemonic = process.env.NEOTOMA_MNEMONIC || "";
    const mnemonicPassphrase = process.env.NEOTOMA_MNEMONIC_PASSPHRASE || "";
    const { deriveMcpAuthToken, hexToKey, mnemonicToSeed } =
      await import("../crypto/key_derivation.js");
    const { readFileSync } = await import("fs");
    let token: string;
    if (keyFilePath) {
      const raw = readFileSync(keyFilePath, "utf8").trim();
      token = deriveMcpAuthToken(hexToKey(raw));
    } else if (mnemonic) {
      const seed = mnemonicToSeed(mnemonic, mnemonicPassphrase);
      token = deriveMcpAuthToken(seed);
    } else {
      if (outputMode === "json") {
        process.stdout.write(
          JSON.stringify({ error: "Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC" }) + "\n"
        );
      } else {
        process.stderr.write(
          "Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC to derive the MCP token.\n"
        );
      }
      process.exitCode = 1;
      return;
    }
    if (outputMode === "json") {
      process.stdout.write(JSON.stringify({ token }) + "\n");
    } else {
      process.stdout.write(`${token}\n`);
      process.stderr.write(
        'Add to .cursor/mcp.json under neotoma: "headers": { "Authorization": "Bearer <token>" }\n'
      );
    }
  });

authCommand
  .command("whoami")
  .description("Get authenticated user ID")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/get_authenticated_user", {
      body: {},
    });
    if (error) throw new Error("Failed to get authenticated user");
    writeOutput(data, outputMode);
  });

const mcpCommand = program.command("mcp").description("MCP server configuration");

mcpCommand
  .command("config")
  .description("Show MCP configuration guidance for Cursor and other clients")
  .option("--no-check", "Skip checking for existing MCP config files")
  .action(async (opts: { check?: boolean }) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    const mcpUrl = `${baseUrl}/mcp`;
    const hasAuth = Boolean(config.connection_id && config.connection_id !== "your-connection-id");

    const exampleConfig = {
      mcpServers: {
        neotoma: hasAuth
          ? { url: mcpUrl, headers: { "X-Connection-Id": config.connection_id } }
          : { url: mcpUrl },
      },
    };

    if (outputMode === "json") {
      writeOutput(
        {
          cursor_config_path: ".cursor/mcp.json",
          example_config: exampleConfig,
          steps: [
            "Run `neotoma auth login` to create an OAuth connection (or use the web UI).",
            "Add the JSON above to .cursor/mcp.json in your project (or Cursor user config).",
            "Use your connection_id from `neotoma auth status` as X-Connection-Id.",
            "Restart Cursor and use Connect if shown, or rely on X-Connection-Id.",
          ],
          docs: "docs/developer/mcp_cursor_setup.md",
        },
        outputMode
      );
      return;
    }

    process.stdout.write(heading("MCP configuration (Cursor)") + nl() + nl());
    process.stdout.write(
      numbered(1, "Create an OAuth connection: " + pathStyle("neotoma auth login")) + "\n"
    );
    process.stdout.write(
      numbered(
        2,
        "Add this to " + pathStyle(".cursor/mcp.json") + " in your project (or Cursor user config):"
      ) +
        nl() +
        nl()
    );
    process.stdout.write(JSON.stringify(exampleConfig, null, 2) + nl() + nl());
    process.stdout.write(
      numbered(
        3,
        "Use your connection_id from " + pathStyle("neotoma auth status") + " as X-Connection-Id."
      ) + "\n"
    );
    process.stdout.write(
      numbered(
        4,
        "Restart Cursor. Use Connect if shown; otherwise X-Connection-Id authenticates."
      ) +
        nl() +
        nl()
    );
    process.stdout.write(
      dim("Full guide: ") + pathStyle("docs/developer/mcp_cursor_setup.md") + nl()
    );

    // Optionally run scan and suggest mcp check if servers are missing (use session ports when set)
    const checkEnabled = opts.check !== false;
    if (checkEnabled) {
      try {
        const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
        const devPortEnv = process.env.NEOTOMA_SESSION_DEV_PORT;
        const prodPortEnv = process.env.NEOTOMA_SESSION_PROD_PORT;
        const devPort =
          devPortEnv && /^\d+$/.test(devPortEnv) ? parseInt(devPortEnv, 10) : undefined;
        const prodPort =
          prodPortEnv && /^\d+$/.test(prodPortEnv) ? parseInt(prodPortEnv, 10) : undefined;
        const { configs } = await scanForMcpConfigs(process.cwd(), { devPort, prodPort });
        const missingAny = configs.some((c) => !c.hasDev || !c.hasProd);
        if (missingAny || configs.length === 0) {
          process.stdout.write(
            nl() +
              dim("Tip: Run ") +
              pathStyle("neotoma mcp check") +
              dim(" to scan and add dev/prod servers to your MCP config files.") +
              nl()
          );
        }
      } catch {
        // Silently skip if scan fails
      }
    }
  });

mcpCommand
  .command("check")
  .description("Scan for MCP config files and offer to install dev/prod servers if missing")
  .option(
    "--user-level",
    "Include user-level MCP config paths (e.g. ~/.cursor/mcp.json, Claude, Windsurf)"
  )
  .action(async (_opts: { userLevel?: boolean }) => {
    const outputMode = resolveOutputMode();

    try {
      const { scanForMcpConfigs, offerInstall } = await import("./mcp_config_scan.js");
      const devPortEnv = process.env.NEOTOMA_SESSION_DEV_PORT;
      const prodPortEnv = process.env.NEOTOMA_SESSION_PROD_PORT;
      const devPort = devPortEnv && /^\d+$/.test(devPortEnv) ? parseInt(devPortEnv, 10) : undefined;
      const prodPort =
        prodPortEnv && /^\d+$/.test(prodPortEnv) ? parseInt(prodPortEnv, 10) : undefined;
      let neotomaRepoRoot: string | null = null;
      try {
        const config = await readConfig();
        if (config.repo_root) neotomaRepoRoot = await validateNeotomaRepo(config.repo_root);
        if (!neotomaRepoRoot && process.env.NEOTOMA_REPO_ROOT) {
          neotomaRepoRoot = await validateNeotomaRepo(process.env.NEOTOMA_REPO_ROOT);
        }
        if (!neotomaRepoRoot) neotomaRepoRoot = await findRepoRoot(process.cwd());
      } catch {
        // leave null
      }
      const { configs, repoRoot } = await scanForMcpConfigs(process.cwd(), {
        includeUserLevel: true,
        userLevelFirst: true,
        devPort,
        prodPort,
        neotomaRepoRoot,
      });

      if (outputMode === "json") {
        writeOutput(
          {
            configs: configs.map((c) => ({ path: c.path, hasDev: c.hasDev, hasProd: c.hasProd })),
            repoRoot,
            missingAny: configs.some((c) => !c.hasDev || !c.hasProd) || configs.length === 0,
          },
          outputMode
        );
        return;
      }

      const missingAny = configs.some((c) => !c.hasDev || !c.hasProd) || configs.length === 0;
      if (missingAny && process.stdout.isTTY) {
        const bannerCtrl = runBannerAnimationLoop();
        await new Promise((r) => setTimeout(r, 1800));
        bannerCtrl.stop();
        await bannerCtrl.whenStopped;
        clearBanner(bannerCtrl.lineCount);
      }

      if (configs.length === 0) {
        process.stdout.write(heading("MCP config check") + nl() + nl());
        process.stdout.write(
          "No MCP config files found (user-level or project-level)." + nl()
        );
        process.stdout.write(nl());
      } else {
        process.stdout.write(heading("MCP config check") + nl() + nl());
        process.stdout.write(
          "Found " + bold(String(configs.length)) + " MCP config file(s):" + nl() + nl()
        );

        for (const config of configs) {
          const devStatus = config.hasDev ? success("✓ configured") : warn("✗ missing");
          const prodStatus = config.hasProd ? success("✓ configured") : warn("✗ missing");
          process.stdout.write("  " + pathStyle(config.path) + nl());
          process.stdout.write("    Dev:  " + devStatus + nl());
          process.stdout.write("    Prod: " + prodStatus + nl());
        }
        process.stdout.write(nl());
      }

      // Offer to install if anything is missing (interactive mode only); use session ports so configs match CLI
      const result = await offerInstall(configs, repoRoot, {
        devPort,
        prodPort,
        cwd: process.cwd(),
      });
      if (result.installed) {
        process.stdout.write(success("✓ ") + result.message + nl());
      } else if (result.message !== "Dev and prod Neotoma servers are already configured.") {
        process.stdout.write(result.message + nl());
      }
    } catch (err) {
      if (outputMode === "json") {
        writeOutput({ error: err instanceof Error ? err.message : String(err) }, outputMode);
      } else {
        process.stderr.write(
          "Error scanning MCP configs: " + (err instanceof Error ? err.message : String(err)) + nl()
        );
      }
      process.exitCode = 1;
    }
  });

const agentInstructionsCommand = program
  .command("cli-instructions")
  .description("Configure CLI instructions: prefer MCP when available, CLI as backup");

agentInstructionsCommand
  .command("config")
  .description("Show guidance for adding 'prefer MCP when available, CLI as backup' to Cursor, Claude, and Codex")
  .action(() => {
    const outputMode = resolveOutputMode();
    if (outputMode === "json") {
      writeOutput(
        {
          message:
            "Prefer Neotoma MCP when installed and running; use CLI as backup when MCP is not available.",
          project_applied_paths: {
            cursor: ".cursor/rules/neotoma_cli.mdc",
            claude: ".claude/rules/neotoma_cli.mdc",
            codex: ".codex/neotoma_cli.md",
          },
          user_paths_linux: {
            cursor: "~/.cursor/rules/neotoma_cli.mdc",
            claude: "~/.claude/rules/neotoma_cli.mdc",
            codex: "~/.codex/neotoma_cli.md",
          },
          docs: "docs/developer/agent_cli_configuration.md",
          instruction_source: "docs/developer/cli_agent_instructions.md",
          run_check: "neotoma cli-instructions check",
        },
        outputMode
      );
      return;
    }
    process.stdout.write(
      heading("CLI instructions: prefer MCP when available, CLI as backup") + nl() + nl()
    );
    process.stdout.write(
      "Add the rule so it is applied in Cursor, Claude Code, and Codex (only paths each IDE loads count)." + nl()
    );
    process.stdout.write(dim("Rule content source: ") + pathStyle("docs/developer/cli_agent_instructions.md") + nl());
    process.stdout.write(nl());
    process.stdout.write(bold("Project (this repo):") + nl());
    process.stdout.write("  Cursor: " + pathStyle(".cursor/rules/neotoma_cli.mdc") + nl());
    process.stdout.write("  Claude: " + pathStyle(".claude/rules/neotoma_cli.mdc") + nl());
    process.stdout.write("  Codex:  " + pathStyle(".codex/neotoma_cli.md") + nl());
    process.stdout.write(nl());
    process.stdout.write(bold("User (all projects):") + nl());
    process.stdout.write("  " + pathStyle("~/.cursor/rules/neotoma_cli.mdc") + " (Cursor)" + nl());
    process.stdout.write("  " + pathStyle("~/.claude/rules/neotoma_cli.mdc") + " (Claude)" + nl());
    process.stdout.write("  " + pathStyle("~/.codex/neotoma_cli.md") + " (Codex)" + nl());
    process.stdout.write(nl());
    process.stdout.write(
      dim("Run ") + pathStyle("neotoma cli-instructions check") + dim(" to add to missing environments.") + nl()
    );
    process.stdout.write(dim("Docs: ") + pathStyle("docs/developer/agent_cli_configuration.md") + nl());
  });

agentInstructionsCommand
  .command("check")
  .description("Scan for 'prefer MCP when available, CLI as backup' in Cursor, Claude, and Codex applied paths; offer to add if missing")
  .option("--user-level", "Include user-level paths in scan", true)
  .option("--no-user-level", "Scan project only")
  .option("--yes", "Non-interactive: only report, do not offer to add")
  .action(async (opts: { userLevel?: boolean; yes?: boolean }) => {
    const outputMode = resolveOutputMode();
    try {
      const {
        scanAgentInstructions,
        offerAddPreferCliRule,
        loadCliAgentInstructions,
        PROJECT_APPLIED_RULE_PATHS,
        getUserAppliedRulePaths,
      } = await import("./agent_instructions_scan.js");
      const result = await scanAgentInstructions(process.cwd(), {
        includeUserLevel: opts.userLevel !== false,
      });

      if (outputMode === "json") {
        writeOutput(
          {
            projectRoot: result.projectRoot,
            applied: result.applied,
            applied_project: result.appliedProject,
            applied_user: result.appliedUser,
            stale_project: result.staleProject,
            stale_user: result.staleUser,
            missing_in_applied: result.missingInApplied,
            needs_update_in_applied: result.needsUpdateInApplied,
            project: result.project.map((p) => ({
              path: p.path,
              label: p.label,
              has_instruction: p.hasInstruction,
            })),
            user: result.user.map((u) => ({
              path: u.path,
              label: u.label,
              has_instruction: u.hasInstruction,
            })),
            missing_in_project: result.missingInProject,
            missing_in_user: result.missingInUser,
            symlink_project: result.symlinkProject,
            symlink_user: result.symlinkUser,
          },
          outputMode
        );
        return;
      }

      process.stdout.write(
        heading("CLI instructions check") + nl() + nl()
      );
      process.stdout.write("Project root: " + pathStyle(result.projectRoot) + nl() + nl());

      const fmtStatus = (ok: boolean, sym: boolean) =>
        ok ? success("✓") + dim(sym ? " symlink" : " file") : dim("○ missing");
      const userPaths = getUserAppliedRulePaths();
      const projRoot = result.projectRoot;

      process.stdout.write(bold("Applied (loaded by each IDE):") + nl());

      process.stdout.write("  " + bold("Project") + nl());
      const projEntries = [
        { label: "Cursor", ok: result.appliedProject.cursor, sym: result.symlinkProject.cursor, relPath: PROJECT_APPLIED_RULE_PATHS.cursor },
        { label: "Claude", ok: result.appliedProject.claude, sym: result.symlinkProject.claude, relPath: PROJECT_APPLIED_RULE_PATHS.claude },
        { label: "Codex",  ok: result.appliedProject.codex,  sym: result.symlinkProject.codex,  relPath: PROJECT_APPLIED_RULE_PATHS.codex },
      ];
      for (const e of projEntries) {
        process.stdout.write(
          "    " + fmtStatus(e.ok, e.sym) + "  " + e.label + "  " + dim(path.join(projRoot, e.relPath)) + nl()
        );
      }

      process.stdout.write("  " + bold("User") + nl());
      const userEntries = userPaths ? [
        { label: "Cursor", ok: result.appliedUser.cursor, sym: result.symlinkUser.cursor, p: userPaths.cursor },
        { label: "Claude", ok: result.appliedUser.claude, sym: result.symlinkUser.claude, p: userPaths.claude },
        { label: "Codex",  ok: result.appliedUser.codex,  sym: result.symlinkUser.codex,  p: userPaths.codex },
      ] : [];
      for (const e of userEntries) {
        process.stdout.write(
          "    " + fmtStatus(e.ok, e.sym) + "  " + e.label + "  " + dim(e.p) + nl()
        );
      }
      process.stdout.write(dim("  (Paths are symlinks to doc when added by check.)") + nl() + nl());

      const projectWith = result.project.filter((p) => p.hasInstruction);
      const projectWithout = result.project.filter((p) => !p.hasInstruction);
      if (result.project.length > 0) {
        process.stdout.write(bold("Scanned (discovery):") + nl());
        for (const p of projectWith) {
          process.stdout.write("  " + success("✓ ") + pathStyle(p.label ?? p.path) + nl());
        }
        for (const p of projectWithout) {
          process.stdout.write("  " + dim("○ ") + pathStyle(p.label ?? p.path) + nl());
        }
        process.stdout.write(nl());
      }

      if (result.user.length > 0) {
        process.stdout.write(bold("User-level (scanned):") + nl());
        for (const u of result.user) {
          const icon = u.hasInstruction ? success("✓ ") : dim("○ ");
          process.stdout.write("  " + icon + pathStyle(u.label ?? u.path) + nl());
        }
        process.stdout.write(nl());
      }

      const missingProject =
        !result.appliedProject.cursor || !result.appliedProject.claude || !result.appliedProject.codex;
      const missingUser =
        !result.appliedUser.cursor || !result.appliedUser.claude || !result.appliedUser.codex;
      const needsUpdate = result.needsUpdateInApplied;
      const needsAddOrUpdate = missingProject || missingUser || needsUpdate;

      if (needsAddOrUpdate) {
        const parts: string[] = [];
        if (missingProject) {
          const missingEnvs: string[] = [];
          if (!result.appliedProject.cursor) missingEnvs.push("Cursor");
          if (!result.appliedProject.claude) missingEnvs.push("Claude");
          if (!result.appliedProject.codex) missingEnvs.push("Codex");
          parts.push("Not applied at project level in: " + missingEnvs.join(", "));
        }
        if (missingUser) {
          const missingEnvs: string[] = [];
          if (!result.appliedUser.cursor) missingEnvs.push("Cursor");
          if (!result.appliedUser.claude) missingEnvs.push("Claude");
          if (!result.appliedUser.codex) missingEnvs.push("Codex");
          parts.push("Not applied at user level in: " + missingEnvs.join(", ") + " (user rules apply to all projects)");
        }
        if (needsUpdate) {
          const staleEnvs: string[] = [];
          if (result.staleProject.cursor || result.staleUser.cursor) staleEnvs.push("Cursor");
          if (result.staleProject.claude || result.staleUser.claude) staleEnvs.push("Claude");
          if (result.staleProject.codex || result.staleUser.codex) staleEnvs.push("Codex");
          if (staleEnvs.length > 0) {
            parts.push("Outdated in: " + staleEnvs.join(", "));
          }
        }
        process.stdout.write(
          warn(parts.join(". ") + ".") + nl()
        );
        if (process.stdin.isTTY && !opts.yes) {
          const { added, skipped } = await offerAddPreferCliRule(result, { nonInteractive: false });
          if (added.length > 0) {
            process.stdout.write(success("Added or updated rule at:") + nl());
            for (const p of added) {
              process.stdout.write("  " + pathStyle(p) + nl());
            }
          } else if (skipped) {
            process.stdout.write(dim("Already up to date for the chosen scope. Nothing written.") + nl());
          }
        } else if (opts.yes) {
          process.stdout.write(dim("Paths to add or update (run without --yes to apply):") + nl());
          if (!result.appliedProject.cursor || result.staleProject.cursor) {
            process.stdout.write("  " + pathStyle(PROJECT_APPLIED_RULE_PATHS.cursor) + nl());
          }
          if (!result.appliedProject.claude || result.staleProject.claude) {
            process.stdout.write("  " + pathStyle(PROJECT_APPLIED_RULE_PATHS.claude) + nl());
          }
          if (!result.appliedProject.codex || result.staleProject.codex) {
            process.stdout.write("  " + pathStyle(PROJECT_APPLIED_RULE_PATHS.codex) + nl());
          }
          const snippetBody = await loadCliAgentInstructions(result.projectRoot);
          process.stdout.write(nl() + dim("Source: docs/developer/cli_agent_instructions.md") + nl());
          process.stdout.write(dim("Snippet:") + nl() + nl());
          process.stdout.write(snippetBody.trim().slice(0, 400) + "…" + nl());
        }
      } else {
        process.stdout.write(
          success("Instruction applied and up to date at project and user level (Cursor, Claude, Codex).") + nl()
        );
      }
    } catch (err) {
      if (outputMode === "json") {
        writeOutput({ error: err instanceof Error ? err.message : String(err) }, outputMode);
      } else {
        process.stderr.write(
          "Error scanning CLI instructions: " +
            (err instanceof Error ? err.message : String(err)) +
            nl()
        );
      }
      process.exitCode = 1;
    }
  });

program
  .command("watch")
  .description("Stream record changes from the database as they happen (local backend only).")
  .option("--env <env>", "Environment to watch (dev or prod); required when running outside a session")
  .option("--interval <ms>", "Polling interval in ms", "400")
  .option("--json", "Output NDJSON (one JSON object per line)")
  .option("--human", "Output one plain line per change (no timestamps, emoji, or IDs)")
  .option("--tail", "Only show changes from now (skip existing records)")
  .action(async (opts: { env?: string; interval?: string; json?: boolean; human?: boolean; tail?: boolean }) => {
    if (sessionWatchState) {
      sessionWatchState.enabled = true;
      const events = await getLastNWatchEntries(
        sessionWatchState.repoRoot,
        sessionWatchState.preferredEnv,
        sessionWatchState.userId,
        WATCH_INITIAL_EVENT_LIMIT
      );
      lastShownWatchEvents = events.length > 0 ? events : null;
      if (events.length > 0) {
        const watchLines = formatWatchTable(events, new Date());
        sessionWatchDisplayRef = { watchLines, watchEventCount: events.length };
        const sessionBoxWidth = getTerminalWidth();
        process.stdout.write(
          "\n" +
            blackBox(watchLines, {
              title: " Recent events ",
              borderColor: "green",
              padding: 1,
              sessionBoxWidth,
            }) +
            "\n"
        );
        process.stdout.write(
          dim("  View details: enter row number (1–" + events.length + ") at the prompt after exiting.") +
            "\n"
        );
      } else {
        sessionWatchDisplayRef = null;
        process.stdout.write("\n" + dim("No recent events.") + "\n");
      }
      sessionWatchState.stop = await startSessionWatch(
        sessionWatchState.repoRoot,
        sessionWatchState.onEvent,
        sessionWatchState.preferredEnv
      );
      process.stdout.write(
        dim("Watch mode. Streaming new events. Press ") +
          pathStyle("Enter") +
          dim(" or ") +
          pathStyle("q") +
          dim(" to exit to prompt.") +
          "\n"
      );
      await runWatchModeExit();
      sessionWatchState.enabled = false;
      sessionWatchState.stop();
      sessionWatchState.stop = () => {};
      sessionWatchDisplayRef = null;
      process.stdout.write("\n" + dim("Exited watch mode.") + "\n");
      return;
    }

    const storageBackend = process.env.NEOTOMA_STORAGE_BACKEND || "local";
    if (storageBackend !== "local") {
      process.stderr.write(
        "neotoma watch requires local backend. Set NEOTOMA_STORAGE_BACKEND=local or use Supabase Realtime for remote.\n"
      );
      process.exit(1);
    }

    const config = await readConfig();
    let token: string | undefined;
    try {
      token = await getCliToken();
    } catch {
      process.stderr.write(
        "neotoma watch requires auth. Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC when encryption is on.\n"
      );
      process.exit(1);
    }
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let userId: string;
    try {
      const res = await fetch(`${baseUrl}/api/me`, { headers });
      if (!res.ok) {
        process.stderr.write(
          "neotoma watch: could not resolve user. Run `neotoma auth login` and ensure the API is running.\n"
        );
        process.exit(1);
      }
      const me = (await res.json()) as { user_id?: string };
      if (!me.user_id) {
        process.stderr.write(
          "neotoma watch: API did not return user_id. Ensure the API is running and you are authenticated.\n"
        );
        process.exit(1);
      }
      userId = me.user_id;
    } catch (err) {
      process.stderr.write(
        "neotoma watch: could not reach API to resolve user. " +
          (err instanceof Error ? err.message : String(err)) +
          ". Run `neotoma auth login` and ensure the API is running.\n"
      );
      process.exit(1);
    }

    let projectRoot: string | undefined = process.env.NEOTOMA_PROJECT_ROOT;
    if (!projectRoot) {
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === "neotoma") projectRoot = process.cwd();
      } catch {
        // not in neotoma repo
      }
    }
    const dataDir =
      process.env.NEOTOMA_DATA_DIR || (projectRoot ? path.join(projectRoot, "data") : "data");
    const watchEnvFlag = opts.env;
    const sessionEnv = process.env.NEOTOMA_SESSION_ENV;
    let watchEnv: "dev" | "prod";
    if (watchEnvFlag === "dev" || watchEnvFlag === "prod") {
      watchEnv = watchEnvFlag;
    } else if (sessionEnv === "dev" || sessionEnv === "prod") {
      watchEnv = sessionEnv;
    } else if (!process.env.NEOTOMA_SQLITE_PATH) {
      process.stderr.write(
        "neotoma watch: no environment specified. Use --env dev or --env prod, or set NEOTOMA_SQLITE_PATH.\n"
      );
      process.exit(1);
      watchEnv = "dev"; // unreachable; satisfy TypeScript
    } else {
      watchEnv = "dev"; // NEOTOMA_SQLITE_PATH is set; env is irrelevant
    }
    const defaultDbFile = watchEnv === "prod" ? "neotoma.prod.db" : "neotoma.db";
    const sqlitePath = process.env.NEOTOMA_SQLITE_PATH || path.join(dataDir, defaultDbFile);

    const resolvedPath = path.isAbsolute(sqlitePath)
      ? sqlitePath
      : path.join(process.cwd(), sqlitePath);
    try {
      await fs.access(resolvedPath);
    } catch {
      process.stderr.write(
        `neotoma watch: SQLite DB not found at ${resolvedPath}. Start the API and ingest data first.\n`
      );
      process.exit(1);
    }

    // Open read-write so we can attach to WAL/shm; we only run SELECT. Opening readonly
    // while the API has the DB in WAL mode often causes "disk I/O error" (readers need shm access).
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(resolvedPath);
    db.pragma("busy_timeout = 2000");

    type TableDef = {
      table: string;
      idCol: string;
      tsCol: string;
      userFilter?: "user_id" | "source_user";
    };
    const tableDefs: TableDef[] = [
      { table: "sources", idCol: "id", tsCol: "created_at" },
      { table: "entities", idCol: "id", tsCol: "created_at" },
      { table: "observations", idCol: "id", tsCol: "created_at" },
      { table: "relationship_observations", idCol: "id", tsCol: "created_at" },
      { table: "timeline_events", idCol: "id", tsCol: "created_at" },
      { table: "interpretations", idCol: "id", tsCol: "started_at", userFilter: "source_user" },
      { table: "entity_snapshots", idCol: "entity_id", tsCol: "computed_at" },
      { table: "raw_fragments", idCol: "id", tsCol: "created_at" },
      { table: "entity_merges", idCol: "id", tsCol: "created_at" },
      { table: "relationship_snapshots", idCol: "relationship_key", tsCol: "computed_at" },
    ];

    const TABLE_EMOJI: Record<string, string> = {
      sources: "📄",
      entities: "👤",
      observations: "👁️",
      relationship_observations: "🔗",
      timeline_events: "📅",
      interpretations: "🔄",
      entity_snapshots: "📊",
      raw_fragments: "📝",
      entity_merges: "🔀",
      relationship_snapshots: "🔗",
    };

    function fetchEntityNames(entityIds: Set<string>, forUserId: string): Map<string, string> {
      const map = new Map<string, string>();
      if (entityIds.size === 0) return map;
      try {
        const placeholders = Array.from(entityIds)
          .map(() => "?")
          .join(",");
        const stmt = db.prepare(
          `SELECT id, canonical_name FROM entities WHERE id IN (${placeholders}) AND user_id = ?`
        );
        const rows = stmt.all(...entityIds, forUserId) as { id: string; canonical_name: string }[];
        for (const r of rows) map.set(r.id, r.canonical_name);
      } catch {
        // entities table may not exist or may lack user_id
      }
      return map;
    }

    function formatWatchSummary(
      table: string,
      row: Record<string, unknown>,
      entityNames: Map<string, string>
    ): string {
      const name = (id: string) => entityNames.get(id) ?? id.slice(0, 12) + "…";
      return getRecordDisplaySummary(table, row, { getEntityDisplayName: name });
    }

    function formatWatchSentence(
      table: string,
      row: Record<string, unknown>,
      entityNames: Map<string, string>
    ): string {
      const v = (k: string) => String(row[k] ?? "").trim();
      const q = (s: string) => (s ? `"${s}"` : "");
      const name = (id: string) => entityNames.get(id) || id.slice(0, 12) + "…";
      const relPerson = (id: string) => {
        const n = entityNames.get(id);
        return n ? `person "${n}"` : `"${id.slice(0, 12)}…"`;
      };
      const entityWithType = (id: string, entityType: string) => {
        const n = entityNames.get(id);
        return n ? `${entityType} "${n}"` : `"${id.slice(0, 12)}…"`;
      };
      switch (table) {
        case "sources":
          return `Created source ${q(v("original_filename") || v("mime_type") || "unknown")}`;
        case "entities": {
          const type = v("entity_type") || "entity";
          return `Created ${type} ${q(v("canonical_name"))}`;
        }
        case "observations": {
          const entityType = v("entity_type") || "entity";
          return `Created observation for ${entityWithType(v("entity_id"), entityType)}`;
        }
        case "relationship_observations":
          return `Created relationship ${q(v("relationship_type"))} for ${relPerson(v("source_entity_id"))} with ${relPerson(v("target_entity_id"))}`;
        case "timeline_events":
          return `Created timeline event ${q(v("event_type"))} at ${v("event_timestamp") || "unknown"}`;
        case "interpretations":
          return `Created interpretation for source ${q(String(v("source_id")).slice(0, 12) + "…")}`;
        case "entity_snapshots":
          return `Updated snapshot for ${relPerson(v("entity_id"))} (${row.observation_count ?? 0} observations)`;
        case "raw_fragments":
          return `Created fragment ${q(v("entity_type") + "." + v("fragment_key"))}`;
        case "entity_merges":
          return `Merged ${q(name(v("from_entity_id")))} into ${q(name(v("to_entity_id")))}`;
        case "relationship_snapshots":
          return `Updated relationship ${q(v("relationship_type"))} for ${relPerson(v("source_entity_id"))} with ${relPerson(v("target_entity_id"))}`;
        default:
          return `Created ${table} record`;
      }
    }

    const now = new Date().toISOString();
    const intervalMs = Math.max(100, parseInt(opts.interval ?? "400", 10) || 400);
    const jsonMode = Boolean(opts.json);
    const humanMode = Boolean(opts.human);
    const skipInitial =
      Boolean(opts.tail) || jsonMode || humanMode;

    if (!jsonMode && !humanMode) {
      process.stderr.write(
        heading("Streaming record changes") + " " + dim("(Ctrl+C to stop)") + "\n"
      );
      process.stderr.write(keyValue("DB", resolvedPath, true) + "\n");
      process.stderr.write(keyValue("User", userId) + "\n");
      process.stderr.write(keyValue("Poll interval", `${intervalMs} ms`) + "\n");
      process.stderr.write(dim("---") + "\n");
    }

    let cursors: Record<string, string>;
    if (skipInitial) {
      cursors = Object.fromEntries(tableDefs.map((t) => [t.table, now]));
    } else {
      const repoRoot = projectRoot ?? process.cwd();
      const initialEvents = await getLastNWatchEntries(
        repoRoot,
        watchEnv,
        userId,
        WATCH_INITIAL_EVENT_LIMIT
      );
      let maxTs = "1970-01-01T00:00:00Z";
      for (const e of initialEvents) {
        if (e.ts && e.ts > maxTs) maxTs = e.ts;
      }
      cursors = Object.fromEntries(tableDefs.map((t) => [t.table, maxTs]));
      for (const e of initialEvents) {
        const emoji = TABLE_EMOJI[e.table] ?? "•";
        const tsStr = e.ts ? new Date(e.ts).toISOString() : "";
        process.stdout.write(`[${tsStr}] ${emoji} ${e.table} ${e.id}  ${e.summary}\n`);
      }
    }

    function collectEntityIds(table: string, rows: Record<string, unknown>[]): Set<string> {
      const ids = new Set<string>();
      for (const row of rows) {
        const add = (k: string) => {
          const val = row[k];
          if (val && typeof val === "string") ids.add(val);
        };
        if (table === "observations") add("entity_id");
        else if (table === "relationship_observations" || table === "relationship_snapshots") {
          add("source_entity_id");
          add("target_entity_id");
        } else if (table === "entity_snapshots") add("entity_id");
        else if (table === "entity_merges") {
          add("from_entity_id");
          add("to_entity_id");
        }
      }
      return ids;
    }

    function poll(): void {
      for (const { table, idCol, tsCol, userFilter } of tableDefs) {
        try {
          const cursor = cursors[table] ?? "1970-01-01T00:00:00Z";
          const userClause =
            userFilter === "source_user"
              ? "source_id IN (SELECT id FROM sources WHERE user_id = ?)"
              : "user_id = ?";
          const stmt = db.prepare(
            `SELECT * FROM ${table} WHERE ${tsCol} IS NOT NULL AND ${tsCol} > ? AND ${userClause} ORDER BY ${tsCol} ASC LIMIT 100`
          );
          const rows = stmt.all(cursor, userId) as Record<string, unknown>[];
          const entityNames = fetchEntityNames(collectEntityIds(table, rows), userId);

          for (const row of rows) {
            const ts = String(row[tsCol] ?? "");
            if (ts && (!cursors[table] || ts > cursors[table])) {
              cursors[table] = ts;
            }
            const id = row[idCol];
            const payload = sortKeys(row) as Record<string, unknown>;
            const summary = formatWatchSummary(table, row, entityNames);
            const event = {
              table,
              emoji: TABLE_EMOJI[table] ?? "•",
              summary,
              operation: "insert",
              id: id ?? null,
              ts_col: tsCol,
              ts: ts || null,
              payload,
            };

            if (jsonMode) {
              process.stdout.write(JSON.stringify(event) + "\n");
            } else if (humanMode) {
              const line = formatWatchSentence(table, row, entityNames);
              process.stdout.write(line + "\n");
            } else {
              const emoji = TABLE_EMOJI[table] ?? "•";
              const tsStr = ts ? new Date(ts).toISOString() : "";
              process.stdout.write(`[${tsStr}] ${emoji} ${table} ${String(id)}  ${summary}\n`);
            }
          }
        } catch (err) {
          // Table may not exist or column may differ
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("no such table")) {
            process.stderr.write(`neotoma watch: ${table}: ${msg}\n`);
          }
        }
      }
    }

    poll();
    const interval = setInterval(poll, intervalMs);
    const onExit = () => {
      clearInterval(interval);
      db.close();
      process.exit(0);
    };
    process.on("SIGINT", onExit);
    process.on("SIGTERM", onExit);
  });

const storageCommand = program.command("storage").description("Storage locations and file paths");

storageCommand
  .command("info")
  .description("Show where CLI config and server data are stored (file paths and backend)")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");

    const storageBackend = process.env.NEOTOMA_STORAGE_BACKEND || "local";
    let projectRoot: string | undefined = process.env.NEOTOMA_PROJECT_ROOT;
    if (!projectRoot) {
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === "neotoma") projectRoot = process.cwd();
      } catch {
        // not in neotoma repo
      }
    }

    const dataDir =
      process.env.NEOTOMA_DATA_DIR || (projectRoot ? path.join(projectRoot, "data") : "data");
    const isProd =
      (process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development") === "production";
    const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
    const sqlitePath = process.env.NEOTOMA_SQLITE_PATH || path.join(dataDir, defaultDbFile);
    const rawStorageSubdir = isProd ? "sources_prod" : "sources";
    const eventLogSubdir = isProd ? "events_prod" : "events";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const rawStorageDir =
      process.env.NEOTOMA_RAW_STORAGE_DIR ||
      (typeof dataDir === "string" && dataDir !== "data"
        ? path.join(dataDir, rawStorageSubdir)
        : path.join("data", rawStorageSubdir));
    const eventLogDir =
      process.env.NEOTOMA_EVENT_LOG_DIR ||
      (typeof dataDir === "string" && dataDir !== "data"
        ? path.join(dataDir, eventLogSubdir)
        : path.join("data", eventLogSubdir));
    const logsDir =
      process.env.NEOTOMA_LOGS_DIR ||
      (typeof dataDir === "string" && dataDir !== "data"
        ? path.join(dataDir, logsSubdir)
        : path.join("data", logsSubdir));

    const info: Record<string, unknown> = {
      config_file: CONFIG_PATH,
      config_description: "CLI credentials and base URL (local only)",
      server_url: baseUrl,
      server_description: "API base URL (your data is served from this backend).",
      storage_backend: storageBackend,
      storage_paths:
        storageBackend === "local"
          ? {
              data_dir: dataDir,
              sqlite_db: sqlitePath,
              raw_sources: rawStorageDir,
              event_log: eventLogDir,
              logs: logsDir,
              description:
                "Local backend: SQLite DB and raw files under data/. Defaults are env-specific (dev: data/sources, data/events, data/logs, neotoma.db; prod: data/sources_prod, data/events_prod, data/logs_prod, neotoma.prod.db). Override with NEOTOMA_DATA_DIR, NEOTOMA_SQLITE_PATH, NEOTOMA_RAW_STORAGE_DIR, NEOTOMA_EVENT_LOG_DIR, NEOTOMA_LOGS_DIR, NEOTOMA_PROJECT_ROOT.",
            }
          : {
              description:
                "Supabase backend: data is stored in your Supabase project (Postgres + Storage bucket 'sources').",
            },
    };

    if (outputMode === "json") {
      writeOutput(info, outputMode);
      return;
    }

    process.stdout.write(heading("Storage and config locations") + nl() + nl());
    process.stdout.write(keyValue("Config file (CLI)", String(info.config_file), true) + "\n");
    process.stdout.write(bullet(String(info.config_description)) + nl());
    process.stdout.write(keyValue("Server", String(info.server_url), true) + "\n");
    process.stdout.write(bullet(String(info.server_description)) + nl());
    process.stdout.write(keyValue("Backend", storageBackend) + "\n");
    if (
      storageBackend === "local" &&
      info.storage_paths &&
      typeof info.storage_paths === "object"
    ) {
      const paths = info.storage_paths as Record<string, unknown>;
      if (paths.data_dir)
        process.stdout.write(keyValue("data_dir", String(paths.data_dir), true) + "\n");
      if (paths.sqlite_db)
        process.stdout.write(keyValue("sqlite_db", String(paths.sqlite_db), true) + "\n");
      if (paths.raw_sources)
        process.stdout.write(keyValue("raw_sources", String(paths.raw_sources), true) + "\n");
      if (paths.event_log)
        process.stdout.write(keyValue("event_log", String(paths.event_log), true) + "\n");
      if (paths.logs) process.stdout.write(keyValue("logs", String(paths.logs), true) + "\n");
      if (paths.description) process.stdout.write(bullet(String(paths.description)) + "\n");
    } else if (
      storageBackend === "supabase" &&
      info.storage_paths &&
      typeof info.storage_paths === "object"
    ) {
      const paths = info.storage_paths as Record<string, unknown>;
      if (paths.description) process.stdout.write(bullet(String(paths.description)) + "\n");
    }
  });

// ── Backup & Restore ──────────────────────────────────────────────────────

const backupCommand = program
  .command("backup")
  .description("Backup encrypted neotoma.db and data files");

backupCommand
  .command("create")
  .description("Create a backup of the local database, sources, and event logs")
  .option("--output <dir>", "Output directory for the backup", "./backups")
  .action(async (opts: { output: string }) => {
    const outputMode = resolveOutputMode();
    let projectRoot: string | undefined = process.env.NEOTOMA_PROJECT_ROOT;
    if (!projectRoot) {
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === "neotoma") projectRoot = process.cwd();
      } catch {
        // not in neotoma repo
      }
    }

    const dataDir =
      process.env.NEOTOMA_DATA_DIR || (projectRoot ? path.join(projectRoot, "data") : "data");
    const isProd =
      (process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development") === "production";
    const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
    const sqlitePath = process.env.NEOTOMA_SQLITE_PATH || path.join(dataDir, defaultDbFile);
    const rawStorageSubdir = isProd ? "sources_prod" : "sources";
    const eventLogSubdir = isProd ? "events_prod" : "events";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const rawStorageDir =
      process.env.NEOTOMA_RAW_STORAGE_DIR || path.join(dataDir, rawStorageSubdir);
    const eventLogDir = process.env.NEOTOMA_EVENT_LOG_DIR || path.join(dataDir, eventLogSubdir);
    const logsDir = process.env.NEOTOMA_LOGS_DIR || path.join(dataDir, logsSubdir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupDir = path.join(opts.output, `neotoma-backup-${timestamp}`);

    await fs.mkdir(backupDir, { recursive: true });

    const manifest: Record<string, unknown> = {
      version: "1.0",
      created_at: new Date().toISOString(),
      contents: {} as Record<string, string>,
      checksums: {} as Record<string, string>,
      encrypted: process.env.NEOTOMA_ENCRYPTION_ENABLED === "true",
      key_required:
        "User must preserve private key file (~/.neotoma/keys/) or mnemonic phrase for restore",
    };
    const contents = manifest.contents as Record<string, string>;
    const checksums = manifest.checksums as Record<string, string>;

    // Copy SQLite DB using file copy (better-sqlite3 backup API requires the DB instance)
    try {
      await fs.access(sqlitePath);
      const destDb = path.join(backupDir, path.basename(sqlitePath));
      await fs.copyFile(sqlitePath, destDb);
      contents.neotoma_db = path.basename(sqlitePath);

      // Compute checksum
      const dbBuf = await fs.readFile(destDb);
      checksums[path.basename(sqlitePath)] =
        "sha256:" + createHash("sha256").update(dbBuf).digest("hex");

      // WAL file
      const walPath = sqlitePath + "-wal";
      try {
        await fs.access(walPath);
        await fs.copyFile(walPath, path.join(backupDir, path.basename(walPath)));
        contents.wal = path.basename(walPath);
      } catch {
        // No WAL file
      }
    } catch {
      writeCliError("SQLite database not found at " + sqlitePath);
    }

    // Copy sources directory
    try {
      await fs.access(rawStorageDir);
      const destSources = path.join(backupDir, "sources");
      await fs.cp(rawStorageDir, destSources, { recursive: true });
      contents.sources = "sources/";
    } catch {
      // No sources directory
    }

    // Copy event log directory
    for (const dir of [eventLogDir, logsDir]) {
      try {
        await fs.access(dir);
        const dirName = path.basename(dir);
        await fs.cp(dir, path.join(backupDir, dirName), { recursive: true });
        contents[dirName] = dirName + "/";
      } catch {
        // Directory does not exist
      }
    }

    // Write manifest
    await fs.writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const result = {
      status: "complete",
      backup_dir: backupDir,
      contents,
      encrypted: manifest.encrypted,
    };

    if (outputMode === "json") {
      writeOutput(result, outputMode);
    } else {
      process.stdout.write(heading("Backup complete") + " " + pathStyle(backupDir) + nl());
      for (const [key, val] of Object.entries(contents)) {
        process.stdout.write(keyValue(key, val, true) + "\n");
      }
      if (manifest.encrypted) {
        process.stdout.write(
          nl() +
            warn("Data is encrypted. Preserve your key file or mnemonic phrase for restore.") +
            nl()
        );
      }
    }
  });

backupCommand
  .command("restore")
  .description("Restore a backup into the data directory")
  .requiredOption("--from <dir>", "Backup directory to restore from")
  .option("--target <dir>", "Target data directory (default: NEOTOMA_DATA_DIR or ./data)")
  .action(async (opts: { from: string; target?: string }) => {
    const outputMode = resolveOutputMode();
    let projectRoot: string | undefined = process.env.NEOTOMA_PROJECT_ROOT;
    if (!projectRoot) {
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === "neotoma") projectRoot = process.cwd();
      } catch {
        // not in neotoma repo
      }
    }

    const targetDir =
      opts.target ||
      process.env.NEOTOMA_DATA_DIR ||
      (projectRoot ? path.join(projectRoot, "data") : "data");

    // Read manifest
    const manifestPath = path.join(opts.from, "manifest.json");
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    } catch {
      writeCliError("No manifest.json found in backup directory: " + opts.from);
      return;
    }

    const contents = (manifest.contents || {}) as Record<string, string>;
    await fs.mkdir(targetDir, { recursive: true });

    // Restore DB
    if (contents.neotoma_db) {
      await fs.copyFile(
        path.join(opts.from, contents.neotoma_db),
        path.join(targetDir, contents.neotoma_db)
      );
    }
    if (contents.wal) {
      await fs.copyFile(path.join(opts.from, contents.wal), path.join(targetDir, contents.wal));
    }

    // Restore directories
    for (const [, val] of Object.entries(contents)) {
      if (typeof val === "string" && val.endsWith("/")) {
        const srcDir = path.join(opts.from, val);
        const destDir = path.join(targetDir, val);
        try {
          await fs.access(srcDir);
          await fs.cp(srcDir, destDir, { recursive: true });
        } catch {
          // skip missing dirs
        }
      }
    }

    const result = {
      status: "restored",
      target_dir: targetDir,
      contents,
      encrypted: manifest.encrypted,
    };

    if (outputMode === "json") {
      writeOutput(result, outputMode);
    } else {
      process.stdout.write(
        heading("Restore complete") + " " + dim("to ") + pathStyle(targetDir) + nl()
      );
      for (const [key, val] of Object.entries(contents)) {
        process.stdout.write(keyValue(key, val, true) + "\n");
      }
      if (manifest.encrypted) {
        process.stdout.write(
          nl() +
            warn("Data is encrypted. You need the original key file or mnemonic to access it.") +
            nl()
        );
      }
    }
  });

// ── Logs ──────────────────────────────────────────────────────────────────

const logsCommand = program.command("logs").description("View and decrypt persistent log files");

logsCommand
  .command("tail")
  .description("Read persistent log files, optionally decrypting encrypted entries")
  .option("--decrypt", "Decrypt encrypted log lines using key file or mnemonic")
  .option("--lines <n>", "Number of lines to show (default: last 50)", "50")
  .option(
    "--file <path>",
    "Specific log file path (default: latest in data/logs or data/events, env-specific)"
  )
  .action(async (opts: { decrypt?: boolean; lines: string; file?: string }) => {
    const outputMode = resolveOutputMode();
    const lineCount = parseInt(opts.lines, 10) || 50;

    let projectRoot: string | undefined = process.env.NEOTOMA_PROJECT_ROOT;
    if (!projectRoot) {
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === "neotoma") projectRoot = process.cwd();
      } catch {
        // not in neotoma repo
      }
    }

    const dataDir =
      process.env.NEOTOMA_DATA_DIR || (projectRoot ? path.join(projectRoot, "data") : "data");
    const isProd =
      (process.env.NEOTOMA_ENV || process.env.NODE_ENV || "development") === "production";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const eventLogSubdir = isProd ? "events_prod" : "events";

    let logFilePath = opts.file;
    if (!logFilePath) {
      const logsDirResolved = process.env.NEOTOMA_LOGS_DIR || path.join(dataDir, logsSubdir);
      const eventLogDirResolved =
        process.env.NEOTOMA_EVENT_LOG_DIR || path.join(dataDir, eventLogSubdir);
      for (const dir of [logsDirResolved, eventLogDirResolved]) {
        try {
          const files = await fs.readdir(dir);
          const logFiles = files.filter((f) => f.endsWith(".jsonl") || f.endsWith(".log"));
          if (logFiles.length > 0) {
            logFiles.sort().reverse();
            logFilePath = path.join(dir, logFiles[0]);
            break;
          }
        } catch {
          // directory does not exist
        }
      }
    }

    if (!logFilePath) {
      writeCliError(
        "No log files found in env-specific data/logs or data/events (dev: logs, events; prod: logs_prod, events_prod)."
      );
      return;
    }

    let content: string;
    try {
      content = await fs.readFile(logFilePath, "utf-8");
    } catch {
      writeCliError("Cannot read log file: " + logFilePath);
      return;
    }

    const allLines = content.split("\n").filter((l) => l.trim().length > 0);
    const lines = allLines.slice(-lineCount);

    let logKey: Uint8Array | null = null;
    if (opts.decrypt) {
      // Dynamically import to avoid loading crypto at CLI startup
      const { deriveKeys, deriveKeysFromMnemonic, hexToKey } =
        await import("../crypto/key_derivation.js");

      const keyFilePath = process.env.NEOTOMA_KEY_FILE_PATH || "";
      const mnemonic = process.env.NEOTOMA_MNEMONIC || "";
      const passphrase = process.env.NEOTOMA_MNEMONIC_PASSPHRASE || "";

      if (keyFilePath) {
        const raw = (await fs.readFile(keyFilePath, "utf-8")).trim();
        const keyBytes = hexToKey(raw);
        logKey = deriveKeys(keyBytes).logKey;
      } else if (mnemonic) {
        logKey = deriveKeysFromMnemonic(mnemonic, passphrase).logKey;
      } else {
        writeCliError("--decrypt requires NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC to be set.");
        return;
      }
    }

    const output: string[] = [];
    for (const line of lines) {
      if (opts.decrypt && logKey) {
        const { isEncryptedLogLine, decryptLogLine } = await import("../utils/log_encrypt.js");
        if (isEncryptedLogLine(line)) {
          try {
            output.push(decryptLogLine(line, logKey));
          } catch {
            output.push("[decryption failed] " + line);
          }
        } else {
          output.push(line);
        }
      } else {
        output.push(line);
      }
    }

    if (outputMode === "json") {
      const parsed = output.map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return l;
        }
      });
      writeOutput({ file: logFilePath, lines: parsed }, outputMode);
    } else {
      process.stdout.write(keyValue("Log file", logFilePath, true) + nl() + nl());
      for (const line of output) {
        process.stdout.write(line + "\n");
      }
    }
  });

/** Result row for a Neotoma server process (any instance, not just this CLI's). */
type NeotomaProcessRow = { pid: number; port: number; command: string; label: string };

/**
 * List all Neotoma API server processes (listening on candidate ports). Uses lsof (Unix) or netstat (Windows).
 * Not limited to the process started by this CLI instance.
 */
function listNeotomaServerProcesses(): NeotomaProcessRow[] {
  const rows: NeotomaProcessRow[] = [];
  const isWin = process.platform === "win32";
  const labelForPort = (p: number) => (p === 8180 ? "prod" : p === 8080 ? "dev" : String(p));

  if (isWin) {
    try {
      for (const port of CANDIDATE_API_PORTS) {
        const out = execSync(`netstat -ano | findstr :${port}`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        const pids = new Set<number>();
        for (const line of out.split("\n")) {
          if (!line.includes(`:${port}`)) continue;
          const parts = line.trim().split(/\s+/);
          const last = parts[parts.length - 1];
          if (last && /^\d+$/.test(last)) {
            const pid = parseInt(last, 10);
            if (pid > 0) pids.add(pid);
          }
        }
        for (const pid of pids) {
          let cmd = "";
          try {
            const wmic = execSync(`wmic process where processid=${pid} get commandline /format:list`, {
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
            });
            const cm = wmic.match(/CommandLine=(.+)/);
            cmd = cm ? cm[1].trim().replace(/\r?\n/g, " ").slice(0, 120) : "";
          } catch {
            cmd = "(unknown)";
          }
          rows.push({ pid, port, command: cmd || "(unknown)", label: labelForPort(port) });
        }
      }
    } catch {
      // netstat/wmic failed
    }
    return rows;
  }

  for (const port of CANDIDATE_API_PORTS) {
    try {
      const pidsOut = execSync(`lsof -i :${port} -n -P -t`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids = pidsOut
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      for (const pid of pids) {
        let command = "";
        try {
          command = execSync(`ps -p ${pid} -o command=`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          })
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 100);
        } catch {
          command = "(unknown)";
        }
        rows.push({ pid, port, command: command || "(unknown)", label: labelForPort(port) });
      }
    } catch {
      // lsof returns non-zero when no process; ignore
    }
  }
  return rows;
}

const apiCommand = program.command("api").description("API runtime status and management");

apiCommand
  .command("status")
  .description("Check if the API server is running")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    const healthUrl = baseUrl + "/health";
    const start = Date.now();
    let ok = false;
    let statusCode: number | undefined;
    let errorMessage: string | undefined;
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
      statusCode = res.status;
      const data = (await res.json()) as { ok?: boolean };
      ok = res.ok && data.ok === true;
    } catch (err) {
      errorMessage = humanReadableApiError(err);
    }
    const latencyMs = Date.now() - start;

    if (outputMode === "json") {
      writeOutput(
        {
          url: healthUrl,
          status: ok ? "up" : "down",
          status_code: statusCode,
          latency_ms: latencyMs,
          error: errorMessage ?? undefined,
        },
        outputMode
      );
      return;
    }

    if (ok) {
      process.stdout.write(bold("API: ") + success("up") + " " + pathStyle(baseUrl) + nl());
      process.stdout.write(keyValue("Latency", `${latencyMs} ms`) + "\n");
    } else {
      process.stderr.write(bold("API: ") + warn("down") + " " + pathStyle(baseUrl) + "\n");
      if (errorMessage) process.stderr.write(bullet(errorMessage) + "\n");
      if (statusCode != null && !errorMessage?.includes("HTTP")) {
        process.stderr.write(bullet("HTTP status: " + statusCode) + "\n");
      }
    }
  });

apiCommand
  .command("start")
  .description("Start the API server (foreground instructions or background)")
  .option(
    "--background",
    "Start the server in the background; logs and PID are env-specific (~/.config/neotoma/logs/api.log or logs_prod/api.log)"
  )
  .action(async (opts: { background?: boolean }) => {
    const outputMode = resolveOutputMode();
    const cwd = process.cwd();

    if (opts.background) {
      let isNeotomaRepo = false;
      try {
        const pkgPath = path.join(cwd, "package.json");
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
        isNeotomaRepo = pkg.name === "neotoma";
      } catch {
        // ignore
      }
      if (!isNeotomaRepo) {
        if (outputMode === "json") {
          writeOutput(
            {
              ok: false,
              error:
                "Not a Neotoma repo (package.json name must be 'neotoma'). Run from the repo root.",
            },
            outputMode
          );
          return;
        }
        process.stderr.write(
          "Not a Neotoma repo. Run 'neotoma api start --background' from the Neotoma repo root.\n"
        );
        return;
      }

      await fs.mkdir(API_LOGS_DIR, { recursive: true });
      const logStream = (await fs.open(API_LOG_PATH, "a")).createWriteStream();
      const logLine = "\n--- neotoma api start (" + new Date().toISOString() + ") ---\n";
      logStream.write(logLine);

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawn(npmCmd, ["run", "dev:server"], {
        cwd,
        detached: true,
        stdio: ["ignore", logStream, logStream],
        env: { ...process.env },
      });
      child.unref();
      await fs.writeFile(API_PID_PATH, String(child.pid ?? ""));

      if (outputMode === "json") {
        writeOutput(
          {
            ok: true,
            pid: child.pid,
            log_file: API_LOG_PATH,
            message: "API server started in background. Use 'neotoma api logs' to view logs.",
          },
          outputMode
        );
        return;
      }
      process.stdout.write(heading("API server started in background.") + nl());
      process.stdout.write(keyValue("PID", String(child.pid ?? "unknown")) + "\n");
      process.stdout.write(keyValue("Logs", API_LOG_PATH, true) + "\n");
      process.stdout.write(
        bullet("View logs: " + pathStyle("neotoma api logs") + " (use --follow to stream)") + "\n"
      );
      return;
    }

    if (outputMode === "json") {
      writeOutput(
        {
          commands: {
            dev: "npm run dev:server",
            dev_prod: "npm run dev:prod",
            start_api: "npm run start:api",
            start_api_prod: "npm run start:api:prod",
          },
          ports: { default: 8080, prod: 8180 },
          message:
            "Run in a separate terminal from the Neotoma repo. CLI defaults to port 8080; for 8180 use --base-url http://localhost:8180",
        },
        outputMode
      );
      return;
    }
    process.stdout.write(
      heading("To start the API server, run in a separate terminal:") + nl() + nl()
    );
    process.stdout.write(
      bullet(pathStyle("npm run dev:server") + dim("   (development, port 8080)")) + "\n"
    );
    process.stdout.write(
      bullet(pathStyle("npm run dev:prod") + dim("    (production-like, port 8180)")) + "\n"
    );
    process.stdout.write(
      bullet(
        pathStyle("npm run start:api") +
          dim("   (production, after npm run build:server; port from HTTP_PORT)")
      ) + "\n"
    );
    process.stdout.write(
      bullet(pathStyle("npm run start:api:prod") + dim("  (production, port 8180)")) + "\n"
    );
    process.stdout.write(
      nl() + bullet("Or start in background: " + pathStyle("neotoma api start --background")) + nl()
    );
    process.stdout.write(
      nl() +
        dim("CLI defaults to port 8080. If the API is on 8180, use: ") +
        pathStyle("neotoma --base-url http://localhost:8180 <command>") +
        nl()
    );
  });

apiCommand
  .command("stop")
  .description("Stop the API server process on the configured port")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    let port = 8080;
    try {
      const u = new URL(baseUrl);
      if (u.port) port = parseInt(u.port, 10);
      else port = u.protocol === "https:" ? 443 : 80;
    } catch {
      // keep default 8080
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      port = 8080;
    }

    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.join(scriptDir, "..", "..");
    const killPortScript = path.join(repoRoot, "scripts", "kill-port.js");

    let ran = false;
    try {
      const scriptExists = await fs
        .access(killPortScript)
        .then(() => true)
        .catch(() => false);
      if (scriptExists) {
        execSync('node "' + killPortScript + '" ' + port, {
          stdio: "inherit",
          cwd: repoRoot,
        });
        ran = true;
      }
    } catch {
      // script failed or not in repo
    }

    if (outputMode === "json") {
      writeOutput(
        {
          port,
          stop_ran: ran,
          message: ran
            ? "Stop command completed for port " + port + "."
            : "Run from repo root to stop: node scripts/kill-port.js " + port,
        },
        outputMode
      );
      return;
    }

    if (ran) {
      process.stdout.write(bold("Stop: ") + success("completed") + " for port " + port + nl());
    } else {
      process.stdout.write(
        bullet(
          "To stop the API server: " +
            pathStyle("node scripts/kill-port.js " + port) +
            " (from repo root)"
        ) + "\n"
      );
    }
  });

apiCommand
  .command("processes")
  .description("List all Neotoma API server processes (all instances, not just this CLI's)")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const rows = listNeotomaServerProcesses();
    if (outputMode === "json") {
      writeOutput(
        { processes: rows, ports_checked: CANDIDATE_API_PORTS },
        outputMode
      );
      return;
    }
    process.stdout.write(heading("Neotoma API server processes") + nl());
    process.stdout.write(dim("Ports checked: " + CANDIDATE_API_PORTS.join(", ") + nl()));
    if (rows.length === 0) {
      process.stdout.write(dim("No processes listening on " + CANDIDATE_API_PORTS.join(" or ") + ".") + nl());
      return;
    }
    const wPid = 8;
    const wPort = 6;
    const wLabel = 6;
    const gap = "  ";
    process.stdout.write(
      bold(padToDisplayWidth("PID", wPid)) +
        gap +
        bold(padToDisplayWidth("Port", wPort)) +
        gap +
        bold(padToDisplayWidth("Label", wLabel)) +
        gap +
        bold("Command") +
        nl()
    );
    process.stdout.write(dim("-".repeat(wPid + wPort + wLabel + 3 * gap.length + 20)) + nl());
    for (const r of rows) {
      process.stdout.write(
        padToDisplayWidth(String(r.pid), wPid) +
          gap +
        padToDisplayWidth(String(r.port), wPort) +
          gap +
        padToDisplayWidth(r.label, wLabel) +
          gap +
        dim(r.command) +
        nl()
      );
    }
    process.stdout.write(nl());
    process.stdout.write(
      dim("To stop a process: ") + pathStyle("neotoma api stop") + dim(" (configured port) or ") + pathStyle("node scripts/kill-port.js <port>") + dim(" from repo root.") + nl()
    );
  });

apiCommand
  .command("logs")
  .description("View API server logs (from neotoma api start --background)")
  .option("--lines <n>", "Number of lines to show", "50")
  .option("--follow", "Stream new log lines (like tail -f)")
  .action(async (opts: { lines?: string; follow?: boolean }) => {
    const outputMode = resolveOutputMode();
    const lines = Math.max(1, parseInt(opts.lines ?? "50", 10) || 50);

    let exists = false;
    try {
      await fs.access(API_LOG_PATH);
      exists = true;
    } catch {
      // file missing
    }

    if (!exists) {
      if (outputMode === "json") {
        writeOutput(
          {
            log_file: API_LOG_PATH,
            error:
              "No log file. Start the API with 'neotoma api start --background' to capture logs.",
          },
          outputMode
        );
        return;
      }
      process.stderr.write("No log file found.\n");
      process.stderr.write(
        "Start the API in the background to capture logs: neotoma api start --background\n"
      );
      return;
    }

    if (outputMode === "json" && !opts.follow) {
      const content = await fs.readFile(API_LOG_PATH, "utf-8");
      const allLines = content.split("\n");
      const tail = allLines.slice(-lines);
      writeOutput(
        { log_file: API_LOG_PATH, lines: tail.length, content: tail.join("\n") },
        outputMode
      );
      return;
    }

    const content = await fs.readFile(API_LOG_PATH, "utf-8");
    const allLines = content.split("\n");
    const tail = allLines.slice(-lines);
    process.stdout.write(tail.join("\n"));
    if (tail.length > 0 && !tail[tail.length - 1]?.endsWith("\n")) {
      process.stdout.write("\n");
    }

    if (opts.follow) {
      process.stdout.write("--- following (Ctrl+C to stop) ---\n");
      let lastSize = (await fs.stat(API_LOG_PATH)).size;
      const interval = setInterval(async () => {
        try {
          const stat = await fs.stat(API_LOG_PATH);
          if (stat.size > lastSize) {
            const fd = await fs.open(API_LOG_PATH, "r");
            const buf = Buffer.alloc(stat.size - lastSize);
            await fd.read(buf, 0, buf.length, lastSize);
            fd.close();
            process.stdout.write(buf.toString("utf-8"));
            lastSize = stat.size;
          }
        } catch {
          clearInterval(interval);
        }
      }, 500);
      const onExit = () => {
        clearInterval(interval);
        process.exit(0);
      };
      process.on("SIGINT", onExit);
      process.on("SIGTERM", onExit);
      return;
    }
  });

program
  .command("stop")
  .description("Stop dev and prod servers started with neotoma --background")
  .action(async () => {
    const outputMode = resolveOutputMode();
    let raw: string;
    try {
      raw = await fs.readFile(BACKGROUND_SERVERS_PATH, "utf-8");
    } catch {
      if (outputMode === "json") {
        writeOutput({ ok: false, error: "No background servers found." }, outputMode);
        return;
      }
      process.stdout.write(dim("No background servers found.") + "\n");
      return;
    }
    let state: BackgroundServersState;
    try {
      state = JSON.parse(raw) as BackgroundServersState;
    } catch {
      if (outputMode === "json") {
        writeOutput({ ok: false, error: "Invalid background servers state file." }, outputMode);
        return;
      }
      process.stderr.write("Invalid background servers state file.\n");
      await fs.unlink(BACKGROUND_SERVERS_PATH).catch(() => {});
      return;
    }
    const { devPid, prodPid, devPort, prodPort } = state;
    const killOne = (pid: number): boolean => {
      if (!pid) return false;
      try {
        process.kill(pid, "SIGTERM");
        return true;
      } catch {
        return false;
      }
    };
    const devKilled = killOne(devPid);
    const prodKilled = killOne(prodPid);
    await fs.unlink(BACKGROUND_SERVERS_PATH).catch(() => {});

    if (outputMode === "json") {
      writeOutput(
        {
          ok: true,
          dev_pid: devPid,
          prod_pid: prodPid,
          dev_killed: devKilled,
          prod_killed: prodKilled,
        },
        outputMode
      );
      return;
    }
    process.stdout.write(success("Background servers stopped.") + "\n");
    if (devKilled || prodKilled) {
      process.stdout.write(
        dim(`Dev ${devPid} (port ${devPort}), prod ${prodPid} (port ${prodPort}) sent SIGTERM.`) +
          "\n"
      );
    }
  });

const devCommand = program
  .command("dev")
  .description("Developer commands from package.json scripts");

devCommand
  .command("list")
  .description("List available npm scripts")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const { scripts } = await loadNpmScripts();
    if (outputMode === "json") {
      writeOutput({ scripts }, outputMode);
      return;
    }
    process.stdout.write(heading("Available npm scripts") + nl() + nl());
    for (const script of scripts) {
      process.stdout.write(keyValue(script.name, script.command, true) + "\n");
    }
    process.stdout.write(
      nl() + dim("Run with: ") + pathStyle("neotoma dev <script> [-- <args>]") + nl()
    );
  });

devCommand
  .command("run")
  .description("Run an npm script")
  .argument("<script>")
  .allowExcessArguments(true)
  .action(async (scriptName: string, ...rest: unknown[]) => {
    const cmd = rest[rest.length - 1] as Command | undefined;
    const extraArgs = cmd?.args ?? [];
    await runNpmScript(scriptName, extraArgs);
  });

const entitiesCommand = program.command("entities").description("Entity commands");
const sourcesCommand = program.command("sources").description("Source commands");
const observationsCommand = program.command("observations").description("Observation commands");
const relationshipsCommand = program.command("relationships").description("Relationship commands");
const timelineCommand = program.command("timeline").description("Timeline commands");
const schemasCommand = program.command("schemas").description("Schema commands");

entitiesCommand
  .command("list")
  .description("List entities or show one entity's properties as a table")
  .argument("[entityId]", "Entity ID (if provided, show this entity's properties as a table)")
  .option("--type <entityType>", "Filter by entity type")
  .option("--entity-type <entityType>", "Filter by entity type (alias for --type)")
  .option("--search <query>", "Search by canonical name")
  .option("--user-id <userId>", "Filter by user ID")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .option("--include-merged", "Include merged entities")
  .action(async (...args: any[]) => {
    // Commander passes different arguments depending on whether optional argument is provided:
    // Without entityId: (command)
    // With entityId: (entityId, command)
    const cmd = args[args.length - 1] as Command;
    const entityId = args.length > 1 ? args[0] as string | undefined : undefined;

    const opts = cmd.opts() as {
      type?: string;
      entityType?: string;
      search?: string;
      userId?: string;
      limit?: string;
      offset?: string;
      includeMerged?: boolean;
    };
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    let id: string | undefined =
      entityId ?? (cmd as { processedArgs?: string[] }).processedArgs?.[0];
    if (!id) {
      const argv = process.argv;
      const listIdx = argv.indexOf("list");
      if (listIdx >= 0 && listIdx + 1 < argv.length) {
        const next = argv[listIdx + 1];
        if (next && /^ent_[a-f0-9]+$/i.test(next)) id = next;
      }
    }
    if (id && /^ent_[a-f0-9]+$/i.test(id)) {
      const { data, error, response } = await api.GET("/api/entities/{id}", {
        params: { path: { id } },
      });
      const status = response?.status;
      if (error) {
        const detail = formatApiError(error);
        let msg = status
          ? `Failed to get entity: ${status} ${detail}`
          : `Failed to get entity: ${detail}`;
        if (status === 401) msg += ". Run `neotoma auth login` to sign in.";
        throw new Error(msg);
      }
      if (outputMode === "pretty") {
        process.stdout.write(
          formatEntityPropertiesTable((data ?? {}) as Record<string, unknown>) + "\n"
        );
        const { data: relData } = await api.GET("/api/entities/{id}/relationships", {
          params: { path: { id } },
        });
        const relSection =
          relData && typeof relData === "object"
            ? formatRelationshipsSection(
                relData as { outgoing?: RelationshipRow[]; incoming?: RelationshipRow[] }
              )
            : "\n" + subHeading("Relationships") + "\n" + dim("Unavailable.");
        process.stdout.write(relSection + "\n");
      } else {
        writeOutput(data, outputMode);
      }
      return;
    }
    // If positional arg is provided and doesn't look like an entity ID, treat it as entity type
    const positionalEntityType = id && !/^ent_[a-f0-9]+$/i.test(id) ? id : undefined;
    const entityType = opts.entityType ?? opts.type ?? positionalEntityType ?? undefined;
    const { data, error, response } = await api.POST("/api/entities/query", {
      body: {
        entity_type: entityType,
        search: opts.search,
        user_id: opts.userId,
        limit: Number(opts.limit ?? "100"),
        offset: Number(opts.offset ?? "0"),
        include_merged: Boolean(opts.includeMerged),
      },
    });
    const status = response?.status;
    if (error) {
      const detail = formatApiError(error);
      let msg = status
        ? `Failed to list entities: ${status} ${detail}`
        : `Failed to list entities: ${detail}`;
      if (status === 401) msg += ". Run `neotoma auth login` to sign in.";
      throw new Error(msg);
    }
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("get")
  .description("Get entity by ID")
  .argument("<id>", "Entity ID")
  .action(async (id: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error, response } = await api.GET("/api/entities/{id}", {
      params: { path: { id } },
    });
    const status = response?.status;
    if (error) {
      const detail = formatApiError(error);
      let msg = status
        ? `Failed to get entity: ${status} ${detail}`
        : `Failed to get entity: ${detail}`;
      if (status === 401) msg += ". Run `neotoma auth login` to sign in.";
      throw new Error(msg);
    }
    if (outputMode === "pretty") {
      process.stdout.write(
        formatEntityPropertiesTable((data ?? {}) as Record<string, unknown>) + "\n"
      );
      const { data: relData } = await api.GET("/api/entities/{id}/relationships", {
        params: { path: { id } },
      });
      const relSection =
        relData && typeof relData === "object"
          ? formatRelationshipsSection(
              relData as { outgoing?: RelationshipRow[]; incoming?: RelationshipRow[] }
            )
          : "\n" + subHeading("Relationships") + "\n" + dim("Unavailable.");
      process.stdout.write(relSection + "\n");
    } else {
      writeOutput(data, outputMode);
    }
  });

entitiesCommand
  .command("search")
  .description("Search entity by identifier (name, email, etc.)")
  .argument("[identifier]", "Identifier to search for (or use --identifier)")
  .option("--identifier <id>", "Identifier to search for (alternative to positional argument)")
  .option("--entity-type <type>", "Limit search to specific entity type")
  .option("--user-id <userId>", "User ID")
  .action(async (identifierArg: string | undefined, opts: { identifier?: string; entityType?: string; userId?: string }) => {
    const identifier = opts.identifier ?? identifierArg;
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    if (!identifier) throw new Error("identifier is required (positional argument or --identifier)");
    const { data, error } = await api.POST("/retrieve_entity_by_identifier", {
      body: {
        identifier,
        entity_type: opts.entityType,
      },
    });
    if (error) throw new Error("Failed to search entity");
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("related")
  .description("Get entities related to a given entity via relationships")
  .argument("<entityId>", "Entity ID")
  .option("--direction <direction>", "Direction: inbound, outbound, both", "both")
  .option("--relationship-types <types>", "Comma-separated relationship types to filter")
  .option("--max-hops <n>", "Maximum relationship hops (1 = direct, 2 = 2-hop, etc.)", "1")
  .option("--include-entities", "Include full entity snapshots in response", true)
  .option("--user-id <userId>", "User ID")
  .action(async (entityId: string, opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const relationshipTypes = opts.relationshipTypes
      ? opts.relationshipTypes.split(",")
      : undefined;
    const { data, error } = await api.POST("/retrieve_related_entities", {
      body: {
        entity_id: entityId,
        direction: opts.direction,
        relationship_types: relationshipTypes,
        max_hops: Number(opts.maxHops),
        include_entities: opts.includeEntities,
      },
    });
    if (error) throw new Error("Failed to get related entities");
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("neighborhood")
  .description(
    "Get complete graph neighborhood around an entity (related entities, relationships, sources, events)"
  )
  .argument("<nodeId>", "Node ID (entity_id or source_id)")
  .option("--node-type <type>", "Node type: entity or source", "entity")
  .option("--include-relationships", "Include relationships", true)
  .option("--include-sources", "Include related sources", true)
  .option("--include-events", "Include timeline events", true)
  .option("--include-observations", "Include observations (entities only)", false)
  .option("--user-id <userId>", "User ID")
  .action(async (nodeId: string, opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/retrieve_graph_neighborhood", {
      body: {
        node_id: nodeId,
        node_type: opts.nodeType,
        include_relationships: opts.includeRelationships,
        include_sources: opts.includeSources,
        include_events: opts.includeEvents,
        include_observations: opts.includeObservations,
      },
    });
    if (error) throw new Error("Failed to get graph neighborhood");
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("delete")
  .description("Delete an entity (creates deletion observation, reversible)")
  .argument("<entityId>", "Entity ID to delete")
  .argument("[entityType]", "Entity type (optional, looked up if not provided)")
  .option("--entity-type <type>", "Entity type (alternative to positional argument)")
  .option("--reason <reason>", "Optional reason for deletion")
  .option("--user-id <userId>", "User ID")
  .action(async (entityId: string, entityTypeArg: string | undefined, opts: { entityType?: string; reason?: string; userId?: string }) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const entityType = opts.entityType ?? entityTypeArg;
    const { data, error } = await api.POST("/delete_entity", {
      body: {
        entity_id: entityId,
        entity_type: entityType ?? "unknown",
        reason: opts.reason,
      },
    });
    if (error) throw new Error("Failed to delete entity");
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("restore")
  .description("Restore a deleted entity (creates restoration observation)")
  .argument("<entityId>", "Entity ID to restore")
  .argument("[entityType]", "Entity type (optional)")
  .option("--entity-type <type>", "Entity type (alternative to positional argument)")
  .option("--reason <reason>", "Optional reason for restoration")
  .option("--user-id <userId>", "User ID")
  .action(async (entityId: string, entityTypeArg: string | undefined, opts: { entityType?: string; reason?: string; userId?: string }) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const entityType = opts.entityType ?? entityTypeArg;
    const { data, error } = await api.POST("/restore_entity", {
      body: {
        entity_id: entityId,
        entity_type: entityType ?? "unknown",
        reason: opts.reason,
      },
    });
    if (error) throw new Error("Failed to restore entity");
    writeOutput(data, outputMode);
  });

sourcesCommand
  .command("get")
  .description("Get source by ID")
  .argument("[id]", "Source ID (or use --source-id)")
  .option("--source-id <id>", "Source ID (alternative to positional argument)")
  .action(async (idArg: string | undefined, opts: { sourceId?: string }) => {
    const id = opts.sourceId ?? idArg;
    if (!id) throw new Error("Source ID is required (positional argument or --source-id)");
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error, response } = await api.GET("/api/sources/{id}", {
      params: { path: { id } },
    });
    const status = response?.status;
    if (error) {
      const detail = formatApiError(error);
      const msg = status
        ? `Failed to get source: ${status} ${detail}`
        : `Failed to get source: ${detail}`;
      if (status === 401) throw new Error(msg + " Run `neotoma auth login` to sign in.");
      throw new Error(msg);
    }
    if (outputMode === "pretty") {
      const rec = (data ?? {}) as Record<string, unknown>;
      process.stdout.write(formatEntityPropertiesTable(rec) + "\n");
    } else {
      writeOutput(data, outputMode);
    }
  });

sourcesCommand
  .command("list")
  .description("List sources")
  .option("--search <query>", "Search by filename or ID")
  .option("--mime-type <mimeType>", "Filter by MIME type")
  .option("--user-id <userId>", "Filter by user ID")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/api/sources", {
      params: {
        query: {
          search: opts.search,
          mime_type: opts.mimeType,
          user_id: opts.userId,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list sources");
    writeOutput(data, outputMode);
  });

observationsCommand
  .command("get")
  .description("Get observation by ID")
  .option("--observation-id <id>", "Observation ID (required)")
  .action(async (opts: { observationId?: string }) => {
    if (!opts.observationId) throw new Error("--observation-id is required");
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/api/observations/query", {
      body: {
        observation_id: opts.observationId,
        limit: 1,
        offset: 0,
      },
    });
    if (error) throw new Error("Failed to get observation");
    const result = data as any;
    const observations: any[] = result?.observations ?? result ?? [];
    const obs = observations[0] ?? null;
    if (!obs) throw new Error(`Observation not found: ${opts.observationId}`);
    writeOutput({ observation: obs }, outputMode);
  });

observationsCommand
  .command("list")
  .description("List observations")
  .option("--entity-id <id>", "Filter by entity ID")
  .option("--entity-type <type>", "Filter by entity type")
  .option("--source-id <id>", "Filter by source ID")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/api/observations/query", {
      body: {
        entity_id: opts.entityId,
        entity_type: opts.entityType,
        source_id: opts.sourceId,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
      },
    });
    if (error) throw new Error("Failed to list observations");
    writeOutput(data, outputMode);
  });

relationshipsCommand
  .command("create")
  .description("Create a relationship between two entities")
  .option("--source-entity-id <id>", "Source entity ID (required)")
  .option("--target-entity-id <id>", "Target entity ID (required)")
  .option("--relationship-type <type>", "Relationship type (required)")
  .option("--user-id <userId>", "User ID")
  .option("--metadata <json>", "Relationship metadata as JSON")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    if (!opts.sourceEntityId) throw new Error("--source-entity-id is required");
    if (!opts.targetEntityId) throw new Error("--target-entity-id is required");
    if (!opts.relationshipType) throw new Error("--relationship-type is required");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const metadata = opts.metadata ? JSON.parse(opts.metadata) : undefined;
    const { data, error } = await api.POST("/create_relationship", {
      body: {
        relationship_type: opts.relationshipType as any,
        source_entity_id: opts.sourceEntityId,
        target_entity_id: opts.targetEntityId,
        metadata,
      },
    });
    if (error) throw new Error("Failed to create relationship");
    const rel = data as any;
    writeOutput(
      {
        relationship_id: rel.relationship_key,
        relationship_type: rel.relationship_type,
        source_entity_id: rel.source_entity_id,
        target_entity_id: rel.target_entity_id,
        metadata: rel.metadata,
        created_at: rel.created_at,
      },
      outputMode
    );
  });

relationshipsCommand
  .command("list")
  .description("List relationships with optional filters")
  .option("--source-entity-id <id>", "Filter by source entity ID")
  .option("--target-entity-id <id>", "Filter by target entity ID")
  .option("--relationship-type <type>", "Filter by relationship type")
  .option("--direction <direction>", "Direction: inbound, outbound, both")
  .option("--user-id <userId>", "Filter by user ID")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/api/relationships", {
      params: {
        query: {
          source_entity_id: opts.sourceEntityId,
          target_entity_id: opts.targetEntityId,
          relationship_type: opts.relationshipType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list relationships");
    writeOutput(data, outputMode);
  });

relationshipsCommand
  .command("get")
  .description("Get a relationship by ID")
  .option("--relationship-id <id>", "Relationship ID (relationship_key)")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    if (!opts.relationshipId) throw new Error("--relationship-id is required");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/api/relationships/{id}", {
      params: { path: { id: encodeURIComponent(opts.relationshipId) } },
    });
    if (error) throw new Error("Failed to get relationship");
    writeOutput({ relationship: data }, outputMode);
  });

relationshipsCommand
  .command("delete")
  .description("Delete a relationship (creates deletion observation, reversible)")
  .option("--relationship-id <id>", "Relationship ID (relationship_key, format: type:source:target)")
  .option("--source-entity-id <id>", "Source entity ID (use with --target-entity-id and --relationship-type)")
  .option("--target-entity-id <id>", "Target entity ID")
  .option("--relationship-type <type>", "Relationship type")
  .option("--user-id <userId>", "User ID")
  .option("--reason <reason>", "Optional reason for deletion")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    let relationshipType: string;
    let sourceEntityId: string;
    let targetEntityId: string;
    if (opts.sourceEntityId && opts.targetEntityId && opts.relationshipType) {
      relationshipType = opts.relationshipType;
      sourceEntityId = opts.sourceEntityId;
      targetEntityId = opts.targetEntityId;
    } else if (opts.relationshipId) {
      const parts = opts.relationshipId.split(":");
      if (parts.length < 3) throw new Error("Invalid relationship ID format (expected type:source:target)");
      const [type, ...rest] = parts;
      relationshipType = type;
      targetEntityId = rest.pop() as string;
      sourceEntityId = rest.join(":");
    } else {
      throw new Error("Provide --relationship-id OR (--source-entity-id, --target-entity-id, --relationship-type)");
    }
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/delete_relationship", {
      body: {
        relationship_type: relationshipType as any,
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
        reason: opts.reason,
      },
    });
    if (error) throw new Error("Failed to delete relationship");
    const result = data as any;
    writeOutput({ success: result?.success ?? true }, outputMode);
  });

relationshipsCommand
  .command("get-snapshot")
  .description("Get relationship snapshot with provenance (observations)")
  .argument("<relationshipType>", "Relationship type (e.g., PART_OF, CORRECTS)")
  .argument("<sourceEntityId>", "Source entity ID")
  .argument("<targetEntityId>", "Target entity ID")
  .action(async (relationshipType: string, sourceEntityId: string, targetEntityId: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/api/relationships/snapshot", {
      body: {
        relationship_type: relationshipType as "PART_OF" | "CORRECTS" | "REFERS_TO" | "SETTLES" | "DUPLICATE_OF" | "DEPENDS_ON" | "SUPERSEDES" | "EMBEDS",
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
      },
    });
    if (error) throw new Error("Failed to get relationship snapshot");
    writeOutput(data, outputMode);
  });

relationshipsCommand
  .command("restore")
  .description("Restore a deleted relationship (creates restoration observation)")
  .option("--relationship-id <id>", "Relationship ID (relationship_key, format: type:source:target)")
  .option("--source-entity-id <id>", "Source entity ID (use with --target-entity-id and --relationship-type)")
  .option("--target-entity-id <id>", "Target entity ID")
  .option("--relationship-type <type>", "Relationship type")
  .option("--user-id <userId>", "User ID")
  .option("--reason <reason>", "Optional reason for restoration")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    let relationshipType: string;
    let sourceEntityId: string;
    let targetEntityId: string;
    if (opts.sourceEntityId && opts.targetEntityId && opts.relationshipType) {
      relationshipType = opts.relationshipType;
      sourceEntityId = opts.sourceEntityId;
      targetEntityId = opts.targetEntityId;
    } else if (opts.relationshipId) {
      const parts = opts.relationshipId.split(":");
      if (parts.length < 3) throw new Error("Invalid relationship ID format (expected type:source:target)");
      const [type, ...rest] = parts;
      relationshipType = type;
      targetEntityId = rest.pop() as string;
      sourceEntityId = rest.join(":");
    } else {
      throw new Error("Provide --relationship-id OR (--source-entity-id, --target-entity-id, --relationship-type)");
    }
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/restore_relationship", {
      body: {
        relationship_type: relationshipType as any,
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
        reason: opts.reason,
      },
    });
    if (error) throw new Error("Failed to restore relationship");
    const result = data as any;
    writeOutput({ success: result?.success ?? true }, outputMode);
  });

timelineCommand
  .command("list")
  .description("List timeline events")
  .option("--start-date <date>", "Filter start date")
  .option("--end-date <date>", "Filter end date")
  .option("--event-type <type>", "Filter by event type")
  .option("--entity-id <id>", "Filter by entity ID")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/api/timeline", {
      params: {
        query: {
          start_date: opts.startDate,
          end_date: opts.endDate,
          event_type: opts.eventType,
          entity_id: opts.entityId,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list timeline events");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("list")
  .description("List schemas")
  .option("--entity-type <type>", "Filter by entity type")
  .option("--user-specific", "Show user-specific schemas")
  .option("--user-id <userId>", "Filter by user ID")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/api/schemas", {
      params: {
        query: {
          entity_type: opts.entityType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list schemas");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("get")
  .description("Get schema by entity type")
  .option("--entity-type <type>", "Entity type (required)")
  .option("--user-id <userId>", "User ID for user-specific schema lookup")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    if (!opts.entityType) throw new Error("--entity-type is required");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/api/schemas/{entity_type}", {
      params: {
        path: { entity_type: opts.entityType },
        query: { user_id: opts.userId },
      },
    });
    if (error) throw new Error("Failed to fetch schema");
    writeOutput({ schema: data }, outputMode);
  });

schemasCommand
  .command("analyze")
  .description("Analyze raw_fragments to identify schema candidate fields")
  .argument("[entityType]", "Entity type to analyze (or use --entity-type)")
  .option("--entity-type <type>", "Entity type to analyze (alternative to positional argument)")
  .option("--user-id <userId>", "User ID")
  .option("--min-confidence <n>", "Minimum confidence score 0-1", "0.8")
  .option("--min-frequency <n>", "Minimum frequency threshold", "5")
  .action(async (entityTypeArg: string | undefined, opts: { entityType?: string; userId?: string; minConfidence?: string; minFrequency?: string }) => {
    const outputMode = resolveOutputMode();
    const entityTypeResolved = opts.entityType ?? entityTypeArg;
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/analyze_schema_candidates", {
      body: {
        entity_type: entityTypeResolved,
        user_id: opts.userId,
        min_confidence: Number(opts.minConfidence),
        min_frequency: Number(opts.minFrequency),
      },
    });
    if (error) throw new Error("Failed to analyze schema candidates");
    const result = data as any;
    writeOutput({ analysis: result?.candidates ?? result }, outputMode);
  });

schemasCommand
  .command("recommend")
  .description("Get schema update recommendations for an entity type")
  .argument("[entityType]", "Entity type (or use --entity-type)")
  .option("--entity-type <type>", "Entity type to get recommendations for")
  .option("--user-id <userId>", "User ID")
  .option("--source <source>", "Recommendation source: raw_fragments, agent, inference, all", "all")
  .option("--status <status>", "Filter by status: pending, approved, rejected", "pending")
  .action(async (entityTypeArg: string | undefined, opts: { entityType?: string; userId?: string; source?: string; status?: string }) => {
    const outputMode = resolveOutputMode();
    const entityTypeResolved = opts.entityType ?? entityTypeArg;
    if (!entityTypeResolved) throw new Error("entity type is required (positional argument or --entity-type)");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/get_schema_recommendations", {
      body: {
        entity_type: entityTypeResolved,
        user_id: opts.userId,
        source: opts.source as any,
        status: opts.status as any,
      },
    });
    if (error) throw new Error("Failed to get schema recommendations");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("update")
  .description("Incrementally update schema by adding new fields")
  .argument("[entityType]", "Entity type (or use --entity-type)")
  .option("--entity-type <type>", "Entity type to update (alternative to positional argument)")
  .option("--fields <json>", "JSON object or array of fields to add (required)")
  .option("--user-id <userId>", "User ID")
  .option("--activate", "Activate schema immediately", true)
  .option("--migrate-existing", "Migrate existing raw_fragments to observations", false)
  .option("--schema-version <version>", "New schema version (auto-increments if not provided)")
  .option("--user-specific", "Create user-specific schema variant", false)
  .action(async (entityTypeArg: string | undefined, opts: { entityType?: string; fields?: string; userId?: string; activate?: boolean; migrateExisting?: boolean; schemaVersion?: string; userSpecific?: boolean }) => {
    const outputMode = resolveOutputMode();
    const entityType = opts.entityType ?? entityTypeArg;
    if (!entityType) throw new Error("entity type is required (positional argument or --entity-type)");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    if (!opts.fields) {
      throw new Error("--fields is required (JSON object or array of field definitions)");
    }
    let fieldsToAdd: any[];
    const parsedFields = JSON.parse(opts.fields);
    if (Array.isArray(parsedFields)) {
      fieldsToAdd = parsedFields;
    } else {
      fieldsToAdd = Object.entries(parsedFields).map(([field_name, def]: [string, any]) => ({
        field_name,
        field_type: def.type ?? "string",
        required: def.required ?? false,
        reducer_strategy: def.reducer,
      }));
    }
    const { data, error } = await api.POST("/update_schema_incremental", {
      body: {
        entity_type: entityType,
        fields_to_add: fieldsToAdd,
        user_id: opts.userId,
        activate: opts.activate,
        migrate_existing: opts.migrateExisting,
        schema_version: opts.schemaVersion,
        user_specific: opts.userSpecific,
      },
    });
    if (error) throw new Error("Failed to update schema");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("register")
  .description("Register a new schema or schema version")
  .argument("[entityType]", "Entity type (or use --entity-type)")
  .option("--entity-type <type>", "Entity type (alternative to positional argument)")
  .option("--fields <json>", "JSON object of fields (format: {fieldName: {type, required}})")
  .option("--schema <json>", "JSON schema definition or fields (alias for --fields)")
  .option("--user-id <userId>", "User ID")
  .option("--schema-version <version>", "Schema version", "1.0")
  .option("--activate", "Activate schema immediately", false)
  .option("--migrate-existing", "Migrate existing data", false)
  .option("--user-specific", "Create user-specific schema", false)
  .action(async (entityTypeArg: string | undefined, opts: { entityType?: string; fields?: string; schema?: string; userId?: string; schemaVersion?: string; activate?: boolean; migrateExisting?: boolean; userSpecific?: boolean }) => {
    const outputMode = resolveOutputMode();
    const entityType = opts.entityType ?? entityTypeArg;
    if (!entityType) throw new Error("entity type is required (positional argument or --entity-type)");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const fieldsJson = opts.fields ?? opts.schema;
    if (!fieldsJson) {
      throw new Error("--fields or --schema is required (JSON object of field definitions)");
    }
    const parsedFields = JSON.parse(fieldsJson);
    let schemaFields: Record<string, any>;
    if (Array.isArray(parsedFields)) {
      schemaFields = {};
      parsedFields.forEach((f: any) => {
        schemaFields[f.field_name] = { type: f.field_type, required: f.required ?? false };
      });
    } else if (parsedFields.fields) {
      // Already a schema definition object
      schemaFields = parsedFields.fields;
    } else {
      schemaFields = Object.fromEntries(
        Object.entries(parsedFields).map(([name, def]: [string, any]) => [
          name,
          { type: def.type ?? "string", required: def.required ?? false },
        ])
      );
    }
    const schemaDefinition = { fields: schemaFields };
    const reducerConfig = {};
    const { data, error } = await api.POST("/register_schema", {
      body: {
        entity_type: entityType,
        schema_definition: schemaDefinition,
        reducer_config: reducerConfig,
        schema_version: opts.schemaVersion,
        activate: opts.activate,
        user_id: opts.userId,
        user_specific: opts.userSpecific,
      },
    });
    if (error) throw new Error("Failed to register schema");
    writeOutput(data, outputMode);
  });

program
  .command("store")
  .description("Store a file or structured entities; routes based on options provided")
  .option("--entities <json>", "Inline JSON array of entities (legacy structured store)")
  .option("--file <path>", "Path to JSON file containing entity array (legacy structured store)")
  .option("--file-path <path>", "Path to any file to store (unstructured pipeline)")
  .option("--file-content <content>", "Inline file content to store")
  .option("--user-id <id>", "User ID for the operation")
  .option("--interpret <bool>", "Run AI interpretation after store (default: false)", "false")
  .option("--source-priority <level>", "Source priority level (default: 100)")
  .option("--idempotency-key <key>", "Idempotency key to prevent duplicate stores")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });

    if (opts.filePath || opts.fileContent) {
      // New file-based store: send to unstructured pipeline
      let fileBuffer: Buffer;
      let originalFilename: string | undefined;
      if (opts.filePath) {
        const resolvedPath = path.isAbsolute(opts.filePath)
          ? opts.filePath
          : path.resolve(process.cwd(), opts.filePath);
        fileBuffer = await fs.readFile(resolvedPath);
        originalFilename = path.basename(resolvedPath);
      } else {
        fileBuffer = Buffer.from(opts.fileContent as string, "utf-8");
        originalFilename = undefined;
      }

      const ext = originalFilename ? path.extname(originalFilename).toLowerCase() : "";
      const mimeMap: Record<string, string> = {
        ".json": "application/json",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".md": "text/markdown",
        ".pdf": "application/pdf",
      };
      const mimeType = mimeMap[ext] ?? "application/octet-stream";
      const shouldInterpret = opts.interpret === "true" || opts.interpret === true;
      const contentBase64 = fileBuffer.toString("base64");
      const idempotencyKey = opts.idempotencyKey ?? createIdempotencyKey({ content: contentBase64 });

      const { data, error } = await api.POST("/api/store/unstructured", {
        body: {
          file_content: contentBase64,
          mime_type: mimeType,
          original_filename: originalFilename,
          interpret: shouldInterpret,
          idempotency_key: idempotencyKey,
        },
      });
      if (error) throw new Error(`Failed to store file: ${JSON.stringify(error)}`);
      writeOutput(data, outputMode);
      return;
    }

    // Legacy structured entities store
    let entities: unknown;
    if (opts.entities) {
      entities = JSON.parse(opts.entities as string);
    } else if (opts.file) {
      const raw = await fs.readFile(opts.file, "utf-8");
      entities = JSON.parse(raw);
    } else {
      throw new Error("Provide --file-path, --file-content, --entities, or --file");
    }

    if (!Array.isArray(entities)) {
      throw new Error("Entities must be an array");
    }

    const idempotencyKey = createIdempotencyKey({ entities });
    const { data, error } = await api.POST("/api/store", {
      body: { entities, idempotency_key: idempotencyKey },
    });
    if (error) throw new Error("Failed to store entities");
    writeOutput(data, outputMode);
  });

program
  .command("store-structured")
  .description("Store structured JSON data as entities")
  .option("--file-path <path>", "Path to JSON file")
  .option("--file-content <content>", "Inline JSON content")
  .option("--entity-type <type>", "Entity type to use if not in data")
  .option("--user-id <id>", "User ID for the operation")
  .option("--source-priority <priority>", "Source priority (default: 100)")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });

    let rawContent: string;
    let originalFilename: string | undefined;

    if (opts.filePath) {
      const resolvedPath = path.isAbsolute(opts.filePath)
        ? opts.filePath
        : path.resolve(process.cwd(), opts.filePath);
      rawContent = await fs.readFile(resolvedPath, "utf-8");
      originalFilename = path.basename(resolvedPath);
    } else if (opts.fileContent) {
      rawContent = opts.fileContent as string;
    } else {
      throw new Error("Provide --file-path or --file-content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error("Invalid JSON content");
    }

    // Normalize to array of entity objects
    let entityArray: Record<string, unknown>[];
    if (Array.isArray(parsed)) {
      entityArray = parsed as Record<string, unknown>[];
    } else {
      entityArray = [parsed as Record<string, unknown>];
    }

    // Apply entity_type from option if missing from data
    const defaultEntityType = opts.entityType ?? "document";
    entityArray = entityArray.map((e) => {
      if (!e.entity_type && !e.type) {
        return { ...e, entity_type: defaultEntityType };
      }
      return e;
    });

    const sourcePriority = opts.sourcePriority ? parseInt(opts.sourcePriority as string, 10) : 100;
    const idempotencyKey = createIdempotencyKey({ entities: entityArray });

    const { data, error } = await api.POST("/api/store", {
      body: {
        entities: entityArray,
        idempotency_key: idempotencyKey,
        source_priority: sourcePriority,
        original_filename: originalFilename,
      },
    });
    if (error) throw new Error("Failed to store structured data");
    writeOutput(data, outputMode);
  });

program
  .command("store-unstructured")
  .description("Store raw unstructured file content")
  .option("--file-path <path>", "Path to file to store")
  .option("--file-content <content>", "Inline file content to store")
  .option("--user-id <id>", "User ID for the operation")
  .option("--interpret <bool>", "Run AI interpretation after store (default: true)", "true")
  .option("--idempotency-key <key>", "Idempotency key to prevent duplicate stores")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });

    let fileBuffer: Buffer;
    let originalFilename: string | undefined;

    if (opts.filePath) {
      const resolvedPath = path.isAbsolute(opts.filePath)
        ? opts.filePath
        : path.resolve(process.cwd(), opts.filePath);
      fileBuffer = await fs.readFile(resolvedPath);
      originalFilename = path.basename(resolvedPath);
    } else if (opts.fileContent) {
      fileBuffer = Buffer.from(opts.fileContent as string, "utf-8");
    } else {
      throw new Error("Provide --file-path or --file-content");
    }

    const ext = originalFilename ? path.extname(originalFilename).toLowerCase() : "";
    const mimeMap: Record<string, string> = {
      ".json": "application/json",
      ".txt": "text/plain",
      ".csv": "text/csv",
      ".md": "text/markdown",
      ".pdf": "application/pdf",
    };
    const mimeType = mimeMap[ext] ?? "text/plain";
    const shouldInterpret = opts.interpret !== "false" && opts.interpret !== false;
    const contentBase64 = fileBuffer.toString("base64");
    const idempotencyKey = opts.idempotencyKey ?? createIdempotencyKey({ content: contentBase64 });

    const { data, error } = await api.POST("/api/store/unstructured", {
      body: {
        file_content: contentBase64,
        mime_type: mimeType,
        original_filename: originalFilename,
        interpret: shouldInterpret,
        idempotency_key: idempotencyKey,
      },
    });
    if (error) throw new Error(`Failed to store unstructured content: ${JSON.stringify(error)}`);
    writeOutput(data, outputMode);
  });

program
  .command("upload <path>")
  .description("Store an unstructured file (raw upload with optional AI interpretation)")
  .option("--no-interpret", "Skip AI interpretation after store")
  .option("--idempotency-key <key>", "Idempotency key (default: content hash)")
  .option("--mime-type <type>", "MIME type (default: inferred from extension)")
  .option("--local", "Run store and interpretation in-process (no API server required)")
  .action(async (filePath: string, opts: { interpret?: boolean; idempotencyKey?: string; mimeType?: string; local?: boolean }) => {
    const outputMode = resolveOutputMode();

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const stat = await fs.stat(resolvedPath).catch(() => null);
    if (!stat?.isFile()) {
      throw new Error(`File not found or not a file: ${resolvedPath}`);
    }

    const fileBuffer = await fs.readFile(resolvedPath);
    const originalFilename = path.basename(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".csv": "text/csv",
      ".json": "application/json",
      ".md": "text/markdown",
      ".html": "text/html",
      ".xml": "application/xml",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
    };
    const mimeType = opts.mimeType ?? mimeMap[ext] ?? "application/octet-stream";

    if (opts.local) {
      // Run the store+interpretation pipeline in-process without an API server.
      try {
        const { storeRawContent } = await import("../services/raw_storage.js");
        const { ensureLocalDevUser } = await import("../services/local_auth.js");

        const userRow = ensureLocalDevUser();
        const userId = userRow.id;

        const idempotencyKey =
          opts.idempotencyKey ??
          (await import("node:crypto")).createHash("sha256").update(fileBuffer).digest("hex");

        const storageResult = await storeRawContent({
          userId,
          fileBuffer,
          mimeType,
          originalFilename: originalFilename.trim() || undefined,
          idempotencyKey,
          provenance: { upload_method: "cli_upload_local", client: "cli" },
        });

        const response: {
          source_id: string;
          content_hash: string;
          file_size: number;
          deduplicated?: boolean;
          interpretation?: unknown;
          interpretation_debug?: Record<string, unknown>;
          entity_ids?: string[];
        } = {
          source_id: storageResult.sourceId,
          content_hash: storageResult.contentHash,
          file_size: storageResult.fileSize,
          deduplicated: storageResult.deduplicated,
        };

        const interpret = opts.interpret !== false;
        if (interpret && storageResult.sourceId) {
          const { extractTextFromBuffer, getPdfFirstPageImageDataUrl, getPdfWorkerDebug } =
            await import("../services/file_text_extraction.js");
          const {
            extractWithLLM,
            extractWithLLMFromImage,
            extractFromCSVWithChunking,
            isLLMExtractionAvailable,
          } = await import("../services/llm_extraction.js");
          const { runInterpretation } = await import("../services/interpretation.js");

          const rawText = await extractTextFromBuffer(fileBuffer, mimeType, originalFilename || "file");

          if (!isLLMExtractionAvailable()) {
            response.interpretation = {
              skipped: true,
              reason: "openai_not_configured",
              message: "Set OPENAI_API_KEY in .env to enable AI interpretation",
            };
            writeOutput(response, outputMode);
            return;
          }

          const isCsv = mimeType?.toLowerCase() === "text/csv";
          const isPdf =
            mimeType.toLowerCase().includes("pdf") || originalFilename.toLowerCase().endsWith(".pdf");
          const rawTextLength = typeof rawText === "string" ? rawText.length : 0;

          const pdfDebug = getPdfWorkerDebug();
          const interpretationDebug: Record<string, unknown> = {
            raw_text_length: rawTextLength,
            pdf_worker_wrapper_used: pdfDebug.configured,
            pdf_worker_wrapper_path_tried: pdfDebug.wrapper_path_tried,
            pdf_worker_set_worker_error: pdfDebug.set_worker_error,
          };

          let extractionResult:
            | Awaited<ReturnType<typeof extractWithLLM>>
            | Awaited<ReturnType<typeof extractFromCSVWithChunking>>;

          if (rawTextLength === 0 && isPdf) {
            interpretationDebug.vision_fallback_attempted = true;
            const imageResult = await getPdfFirstPageImageDataUrl(
              fileBuffer,
              mimeType,
              originalFilename || "file",
              { returnError: true }
            );
            const imageDataUrl = typeof imageResult === "object" ? imageResult.dataUrl : imageResult;
            if (typeof imageResult === "object" && imageResult.error) {
              interpretationDebug.vision_fallback_image_error = imageResult.error;
            }
            interpretationDebug.vision_fallback_image_got = Boolean(imageDataUrl);
            if (imageDataUrl) {
              try {
                extractionResult = await extractWithLLMFromImage(
                  imageDataUrl,
                  originalFilename || "file",
                  mimeType,
                  "gpt-4o"
                );
                interpretationDebug.used_vision_fallback = true;
              } catch (visionErr) {
                interpretationDebug.vision_fallback_error =
                  visionErr instanceof Error ? visionErr.message : String(visionErr);
                extractionResult = await extractWithLLM(
                  rawText,
                  originalFilename || "file",
                  mimeType,
                  "gpt-4o"
                );
              }
            } else {
              extractionResult = await extractWithLLM(
                rawText,
                originalFilename || "file",
                mimeType,
                "gpt-4o"
              );
            }
          } else {
            extractionResult = isCsv
              ? await extractFromCSVWithChunking(rawText, originalFilename || "file", mimeType, "gpt-4o")
              : await extractWithLLM(rawText, originalFilename || "file", mimeType, "gpt-4o");
          }

          let extractedData: Array<Record<string, unknown>>;
          if ("entities" in extractionResult) {
            extractedData = extractionResult.entities.map((e) => ({
              entity_type: e.entity_type,
              ...e.fields,
            }));
          } else {
            const { entity_type, fields } = extractionResult;
            extractedData = [{ entity_type, ...fields }];
          }

          const defaultConfig = {
            provider: "openai",
            model_id: "gpt-4o",
            temperature: 0,
            prompt_hash: "llm_extraction_v2_idempotent",
            code_version: "v0.2.0",
          };
          interpretationDebug.extraction_field_keys = extractedData.flatMap((d) =>
            Object.keys(d).filter((k) => k !== "entity_type" && k !== "type")
          );
          response.interpretation_debug = interpretationDebug;

          try {
            const interpretationResult = await runInterpretation({
              userId,
              sourceId: storageResult.sourceId,
              extractedData,
              config: defaultConfig,
            });
            response.interpretation = interpretationResult;
            if (interpretationResult.entities?.length) {
              response.entity_ids = interpretationResult.entities.map((e) => e.entityId);
            }
          } catch (interpretError) {
            response.interpretation = {
              error: interpretError instanceof Error ? interpretError.message : String(interpretError),
              skipped: true,
            };
          }
        }

        writeOutput(response, outputMode);
      } catch (localError) {
        const msg = localError instanceof Error ? localError.message : String(localError);
        throw new Error(
          `Local mode failed: ${msg}\nEnsure .env and backend (NEOTOMA_STORAGE_BACKEND, DB path or Supabase) are configured.`
        );
      }
      return;
    }

    // Default: send to API server.
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });

    const base64 = fileBuffer.toString("base64");
    const body = {
      file_content: base64,
      mime_type: mimeType,
      original_filename: originalFilename,
      interpret: opts.interpret !== false,
    };
    if (opts.idempotencyKey) {
      (body as { idempotency_key?: string }).idempotency_key = opts.idempotencyKey;
    }

    const { data, error } = await api.POST("/api/store/unstructured", { body });
    if (error) throw new Error("Failed to upload file");
    writeOutput(data, outputMode);
  });

/** Dashboard stats response shape for table formatting. */
interface StatsData {
  sources_count?: number;
  total_entities?: number;
  total_relationships?: number;
  total_events?: number;
  total_observations?: number;
  total_interpretations?: number;
  entities_by_type?: Record<string, number>;
  last_updated?: string;
}

function printStatsTables(stats: StatsData): void {
  const gap = "  ";
  // Summary table
  const summaryRows: [string, string][] = [
    ["sources", String(stats.sources_count ?? 0)],
    ["entities", String(stats.total_entities ?? 0)],
    ["relationships", String(stats.total_relationships ?? 0)],
    ["timeline events", String(stats.total_events ?? 0)],
    ["observations", String(stats.total_observations ?? 0)],
    ["interpretations", String(stats.total_interpretations ?? 0)],
  ];
  const keyWidth = Math.max(...summaryRows.map(([k]) => displayWidth(k)), displayWidth("Metric"));
  const valWidth = Math.max(...summaryRows.map(([, v]) => displayWidth(v)), displayWidth("Count"));
  process.stdout.write(bold("Summary") + "\n\n");
  process.stdout.write(
    padToDisplayWidth("Metric", keyWidth) + gap + padToDisplayWidth("Count", valWidth) + "\n"
  );
  process.stdout.write(dim("-".repeat(keyWidth) + gap + "-".repeat(valWidth)) + "\n");
  for (const [k, v] of summaryRows) {
    process.stdout.write(
      padToDisplayWidth(k, keyWidth) + gap + padToDisplayWidth(v, valWidth) + "\n"
    );
  }
  process.stdout.write("\n");

  // Entities by type table (sorted by count desc, then by type name)
  const byType = stats.entities_by_type ?? {};
  const typeEntries = Object.entries(byType).sort((a, b) => {
    const diff = b[1] - a[1];
    return diff !== 0 ? diff : a[0].localeCompare(b[0]);
  });
  if (typeEntries.length === 0) {
    process.stdout.write(bold("Entities by type") + "\n\n" + dim("(none)") + "\n");
    return;
  }
  const typeColWidth = Math.max(
    ...typeEntries.map(([t]) => displayWidth(t)),
    displayWidth("Entity type")
  );
  const countColWidth = Math.max(
    ...typeEntries.map(([, c]) => displayWidth(String(c))),
    displayWidth("Count")
  );
  process.stdout.write(bold("Entities by type") + "\n\n");
  process.stdout.write(
    padToDisplayWidth("Entity type", typeColWidth) +
      gap +
      padToDisplayWidth("Count", countColWidth) +
      "\n"
  );
  process.stdout.write(dim("-".repeat(typeColWidth) + gap + "-".repeat(countColWidth)) + "\n");
  for (const [entityType, count] of typeEntries) {
    process.stdout.write(
      padToDisplayWidth(entityType, typeColWidth) +
        gap +
        padToDisplayWidth(String(count), countColWidth) +
        "\n"
    );
  }
  process.stdout.write("\n");
}

/** Print only entity counts by type (for `stats entities`). */
function printEntitiesByTypeTable(stats: StatsData): void {
  const gap = "  ";
  const total = stats.total_entities ?? 0;
  const byType = stats.entities_by_type ?? {};
  const typeEntries = Object.entries(byType).sort((a, b) => {
    const diff = b[1] - a[1];
    return diff !== 0 ? diff : a[0].localeCompare(b[0]);
  });
  process.stdout.write(bold("Entities by type") + "  " + dim(`(total: ${total})`) + "\n\n");
  if (typeEntries.length === 0) {
    process.stdout.write(dim("(none)") + "\n");
    return;
  }
  const typeColWidth = Math.max(
    ...typeEntries.map(([t]) => displayWidth(t)),
    displayWidth("Entity type")
  );
  const countColWidth = Math.max(
    ...typeEntries.map(([, c]) => displayWidth(String(c))),
    displayWidth("Count")
  );
  process.stdout.write(
    padToDisplayWidth("Entity type", typeColWidth) +
      gap +
      padToDisplayWidth("Count", countColWidth) +
      "\n"
  );
  process.stdout.write(dim("-".repeat(typeColWidth) + gap + "-".repeat(countColWidth)) + "\n");
  for (const [entityType, count] of typeEntries) {
    process.stdout.write(
      padToDisplayWidth(entityType, typeColWidth) +
        gap +
        padToDisplayWidth(String(count), countColWidth) +
        "\n"
    );
  }
  process.stdout.write("\n");
}

// Add new interpretations command (after store command)
const interpretationsCommand = program
  .command("interpretations")
  .description("Interpretation commands");

interpretationsCommand
  .command("reinterpret")
  .description("Re-run AI interpretation on an existing source or interpretation")
  .argument("[sourceId]", "Source ID to reinterpret (or use --source-id / --interpretation-id)")
  .option("--source-id <id>", "Source ID to reinterpret")
  .option("--interpretation-id <id>", "Interpretation ID (looks up source automatically)")
  .option("--interpretation-config <json>", "Optional interpretation configuration JSON")
  .option("--user-id <userId>", "User ID")
  .action(async (sourceIdArg: string | undefined, opts: { sourceId?: string; interpretationId?: string; interpretationConfig?: string; userId?: string }) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const interpretationConfig = opts.interpretationConfig
      ? JSON.parse(opts.interpretationConfig)
      : undefined;

    const sourceId = opts.sourceId ?? sourceIdArg;

    if (!sourceId && !opts.interpretationId) throw new Error("source ID or --interpretation-id is required");

    const reinterpretBody: Record<string, unknown> = {
      interpretation_config: interpretationConfig,
    };
    if (sourceId) reinterpretBody["source_id"] = sourceId;
    if (opts.interpretationId) reinterpretBody["interpretation_id"] = opts.interpretationId;

    const { data, error } = await api.POST("/reinterpret", {
      body: reinterpretBody as any,
    });
    if (error) throw new Error("Failed to reinterpret source");
    const result = data as any;
    writeOutput({
      interpretation_id: result?.interpretation_id ?? opts.interpretationId,
      reinterpreted: result?.success ?? true,
      observations_created: result?.observations_created ?? 0,
    }, outputMode);
  });

// Add new corrections command (after interpretations command)
const correctionsCommand = program.command("corrections").description("Correction commands");

correctionsCommand
  .command("create")
  .description("Create high-priority correction observation")
  .argument("[entityId]", "Entity ID to correct (or use --entity-id)")
  .option("--entity-id <id>", "Entity ID to correct")
  .option("--entity-type <type>", "Entity type (optional, looked up if not provided)")
  .option("--field-name <field>", "Field name to correct (required)")
  .option("--corrected-value <value>", "Corrected value (required)")
  .option("--user-id <userId>", "User ID")
  .option("--idempotency-key <key>", "Idempotency key (auto-generated if not provided)")
  .action(async (entityIdArg: string | undefined, opts: { entityId?: string; entityType?: string; fieldName?: string; correctedValue?: string; userId?: string; idempotencyKey?: string }) => {
    const outputMode = resolveOutputMode();
    const entityId = opts.entityId ?? entityIdArg;
    if (!entityId) throw new Error("entity ID is required (positional argument or --entity-id)");
    if (!opts.fieldName) throw new Error("--field-name is required");
    if (opts.correctedValue === undefined) throw new Error("--corrected-value is required");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const idempotencyKey = opts.idempotencyKey || createIdempotencyKey({ entityId, field: opts.fieldName, value: opts.correctedValue });
    const { data, error } = await api.POST("/correct", {
      body: {
        entity_id: entityId,
        entity_type: opts.entityType ?? "unknown",
        field: opts.fieldName,
        value: opts.correctedValue,
        idempotency_key: idempotencyKey,
        user_id: opts.userId,
      },
    });
    if (error) throw new Error("Failed to create correction");
    const result = data as any;
    const correctionId = result?.observation?.id ?? result?.correction_id ?? idempotencyKey;
    writeOutput({ correction_id: correctionId, entity_id: entityId, success: result?.success ?? true }, outputMode);
  });

const statsCmd = program.command("stats").description("Dashboard and entity statistics");
statsCmd.action(async () => {
  const outputMode = resolveOutputMode();
  const config = await readConfig();
  const token = await getCliToken();
  const api = createApiClient({
    baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
    token,
  });
  const { data, error } = await api.GET("/api/stats", {});
  if (error) throw new Error("Failed to fetch stats");
  if (outputMode === "json") {
    writeOutput(data, outputMode);
    return;
  }
  printStatsTables((data ?? {}) as StatsData);
});
statsCmd
  .command("entities")
  .description("Entity counts by type")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/api/stats", {});
    if (error) throw new Error("Failed to fetch stats");
    const stats = (data ?? {}) as StatsData;
    if (outputMode === "json") {
      writeOutput(
        {
          total_entities: stats.total_entities ?? 0,
          entities_by_type: stats.entities_by_type ?? {},
        },
        outputMode
      );
      return;
    }
    printEntitiesByTypeTable(stats);
  });

// Add new snapshots command (after stats command)
const snapshotsCommand = program.command("snapshots").description("Snapshot diagnostics");

snapshotsCommand
  .command("check")
  .description("Check for stale entity snapshots")
  .option("--auto-fix", "Automatically recompute stale snapshots", false)
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/health_check_snapshots", {
      body: {
        auto_fix: opts.autoFix,
      },
    });
    if (error) throw new Error("Failed to check snapshots");
    writeOutput(data, outputMode);
  });

program
  .command("request")
  .description("Call an OpenAPI operation by operationId")
  .requiredOption("--operation <id>", "OpenAPI operationId")
  .option("--params <json>", "JSON with { path, query, body }")
  .option("--body <json>", "JSON body override")
  .option("--query <json>", "JSON query override")
  .option("--path <json>", "JSON path override")
  .option("--skip-auth", "Skip auth token for public endpoints")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const operation = getOpenApiOperationMapping(opts.operation);
    if (!operation) {
      throw new Error("Unknown operationId: " + opts.operation);
    }

    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
    const token = opts.skipAuth ? undefined : await getCliToken();
    const api = createApiClient({ baseUrl, token });

    const params = parseOptionalJson(opts.params);
    const body = parseOptionalJson(opts.body);
    const query = parseOptionalJson(opts.query);
    const pathParams = parseOptionalJson(opts.path);

    const requestParams: Record<string, unknown> =
      params && typeof params === "object" ? { ...(params as Record<string, unknown>) } : {};

    if (body) {
      requestParams.body = body;
    }
    if (query) {
      requestParams.params = {
        ...(requestParams.params as Record<string, unknown> | undefined),
        query,
      };
    }
    if (pathParams) {
      requestParams.params = {
        ...(requestParams.params as Record<string, unknown> | undefined),
        path: pathParams,
      };
    }

    const method = operation.method.toUpperCase();
    const handler = (api as unknown as Record<string, unknown>)[method] as
      | ((
          path: string,
          params: Record<string, unknown>
        ) => Promise<{
          data?: unknown;
          error?: unknown;
        }>)
      | undefined;

    if (!handler) {
      throw new Error("Unsupported method for request: " + operation.method);
    }

    const { data, error } = await handler(operation.path, requestParams);
    if (error) {
      throw new Error("Request failed: " + formatApiError(error));
    }
    writeOutput(data, outputMode);
  });

let devCommandsReady = false;
async function ensureDevCommands(): Promise<void> {
  if (devCommandsReady) return;
  devCommandsReady = true;
  const result = await loadNpmScripts().catch(() => null);
  if (!result) return;
  for (const script of result.scripts) {
    devCommand
      .command(script.name)
      .description(`Run: npm run ${script.name}`)
      .allowExcessArguments(true)
      .action(async (...rest: unknown[]) => {
        const cmd = rest[rest.length - 1] as Command | undefined;
        const extraArgs = cmd?.args ?? [];
        await runNpmScript(script.name, extraArgs);
      });
  }
}

/** Fetch and format storage summary for intro (no args). Returns null if API down or stats fail. */
async function fetchStorageSummary(): Promise<string | null> {
  try {
    const config = await readConfig();
    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
    const token = await getCliToken();
    const api = createApiClient({ baseUrl, token });
    const { data, error } = await api.GET("/api/stats", {});
    if (error || !data) return null;
    const stats = data as {
      sources_count?: number;
      total_entities?: number;
      total_relationships?: number;
      total_events?: number;
      total_observations?: number;
      total_interpretations?: number;
      entities_by_type?: Record<string, number>;
    };
    const parts: string[] = [];
    parts.push(bullet("sources: " + (stats.sources_count ?? 0)));
    parts.push(bullet("entities: " + (stats.total_entities ?? 0)));
    if (stats.entities_by_type && Object.keys(stats.entities_by_type).length > 0) {
      const byType = Object.entries(stats.entities_by_type)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([t, n]) => `${t}=${n}`)
        .join(", ");
      parts.push(bullet("by type: " + byType, 1));
    }
    parts.push(bullet("observations: " + (stats.total_observations ?? 0)));
    parts.push(bullet("timeline events: " + (stats.total_events ?? 0)));
    parts.push(bullet("interpretations: " + (stats.total_interpretations ?? 0)));
    return parts.join("\n");
  } catch {
    return null;
  }
}

/** Pack-rat (bunny) artwork for intro box. */
const INTRO_PACK_RAT_LINES = ["(\\__/)", "(•ㅅ•)", "/ 　 づ"];
const INTRO_PACK_RAT_FACE_WINK = "(-ㅅ•)";
const INTRO_WINK_MS = 180;
const INTRO_PACK_RAT_DISPLAY_WIDTH = Math.max(
  ...INTRO_PACK_RAT_LINES.map((s) => displayWidth(s))
);

/** Minimum content width so the box fits all summary stats (e.g. "N entities, N relationships, N sources"). */
const INTRO_MIN_WIDTH = 52;

const INIT_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INIT_SPINNER_MS = 80;

/** Resolve package.json from CLI entry (dist/cli/index.js -> ../../package.json). */
const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_CACHE_PATH = path.join(CONFIG_DIR, "update_check.json");

async function getCliVersion(): Promise<string> {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(dir, "..", "..", "package.json");
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "?";
  } catch {
    return "?";
  }
}

async function getPackageName(): Promise<string> {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(dir, "..", "..", "package.json");
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { name?: string };
    return typeof pkg.name === "string" ? pkg.name : "neotoma";
  } catch {
    return "neotoma";
  }
}

/** Fire-and-forget: check npm registry for newer version and, if available, write one-line notice to stderr. Never blocks or throws. */
function runUpdateNotifier(): void {
  if (process.env.CI !== undefined && process.env.CI !== "") return;
  if (process.env.NO_UPDATE_NOTIFIER === "1") return;
  const opts = program.opts() as { updateCheck?: boolean };
  if (opts.updateCheck === false) return;
  if (resolveOutputMode() === "json") return;
  if (!process.stdout.isTTY) return;

  void (async () => {
    try {
      const [current, packageName] = await Promise.all([
        getCliVersion(),
        getPackageName(),
      ]);
      if (!current || current === "?") return;

      let latest: string | null = null;
      try {
        const raw = await fs.readFile(UPDATE_CHECK_CACHE_PATH, "utf-8");
        const cache = JSON.parse(raw) as { latest?: string; checkedAt?: number };
        if (
          typeof cache.checkedAt === "number" &&
          Date.now() - cache.checkedAt < UPDATE_CHECK_TTL_MS &&
          typeof cache.latest === "string"
        ) {
          latest = cache.latest;
        }
      } catch {
        // no cache or stale
      }
      if (latest === null) {
        latest = await getLatestFromRegistry(packageName, "latest");
        if (latest) {
          await fs.mkdir(path.dirname(UPDATE_CHECK_CACHE_PATH), {
            recursive: true,
          });
          await fs.writeFile(
            UPDATE_CHECK_CACHE_PATH,
            JSON.stringify({ latest, checkedAt: Date.now() }),
            "utf-8"
          );
        }
      }
      if (latest && isUpdateAvailable(current, latest)) {
        const cmd = formatUpgradeCommand(packageName, "latest", "global");
        const line1 =
          dim("Update available: ") +
          pathStyle(`${packageName} ${current}`) +
          dim(" → ") +
          pathStyle(latest) +
          "\n";
        const line2 = dim("Run: ") + pathStyle(cmd) + "\n";
        process.stderr.write(line1 + line2);
      }
    } catch {
      // never surface to user
    }
  })();
}

/** Recursive directory size in bytes (best-effort). */
/** Read last N lines from a file. Returns empty string on error. */
async function readLastLines(filePath: string, n: number): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    return lines.slice(-n).join("\n").trim();
  } catch {
    return "";
  }
}

/** Table defs and emoji for watch-style entries (must match watch command). */
const WATCH_ENTRY_TABLE_DEFS = [
  { table: "sources", idCol: "id", tsCol: "created_at" },
  { table: "entities", idCol: "id", tsCol: "created_at" },
  { table: "observations", idCol: "id", tsCol: "created_at" },
  { table: "relationship_observations", idCol: "id", tsCol: "created_at" },
  { table: "timeline_events", idCol: "id", tsCol: "created_at" },
  {
    table: "interpretations",
    idCol: "id",
    tsCol: "started_at",
    userFilter: "source_user" as const,
  },
  { table: "entity_snapshots", idCol: "entity_id", tsCol: "computed_at" },
  { table: "raw_fragments", idCol: "id", tsCol: "created_at" },
  { table: "entity_merges", idCol: "id", tsCol: "created_at" },
  { table: "relationship_snapshots", idCol: "relationship_key", tsCol: "computed_at" },
];
const _WATCH_ENTRY_EMOJI: Record<string, string> = {
  sources: "📄",
  entities: "👤",
  observations: "👁️",
  relationship_observations: "🔗",
  timeline_events: "📅",
  interpretations: "🔄",
  entity_snapshots: "📊",
  raw_fragments: "📝",
  entity_merges: "🔀",
  relationship_snapshots: "🔗",
};

/**
 * Intro stats (entity/source/event counts) from the local SQLite DB.
 * Used when the API returns all zeros but Recent events show data (e.g. server using remote storage).
 */
async function getLocalIntroStats(
  repoRoot: string,
  preferredEnv: "dev" | "prod",
  userId: string | null
): Promise<{
  total_entities: number;
  total_relationships: number;
  total_sources: number;
  total_events: number;
} | null> {
  if (process.env.NEOTOMA_STORAGE_BACKEND && process.env.NEOTOMA_STORAGE_BACKEND !== "local") {
    return null;
  }
  if (!userId) return null;
  const dataDir = path.join(repoRoot, "data");
  const dbFile = preferredEnv === "prod" ? "neotoma.prod.db" : "neotoma.db";
  const dbPath = path.join(dataDir, dbFile);
  try {
    await fs.access(dbPath);
  } catch {
    return null;
  }
  type DbInstance = {
    close: () => void;
    prepare: (sql: string) => { get: (...args: unknown[]) => { "count(*)": number } | undefined };
    pragma: (s: string) => void;
  };
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(dbPath) as unknown as DbInstance;
    db.pragma("busy_timeout = 2000");
    const getCount = (sql: string, ...args: unknown[]): number => {
      const row = db.prepare(sql).get(...args) as { "count(*)": number } | undefined;
      return row != null && typeof row["count(*)"] === "number" ? row["count(*)"] : 0;
    };
    const entities = getCount(
      "SELECT count(*) FROM entities WHERE user_id = ? AND merged_to_entity_id IS NULL",
      userId
    );
    const relationships =
      getCount("SELECT count(*) FROM relationship_snapshots WHERE user_id = ?", userId);
    const sources = getCount("SELECT count(*) FROM sources WHERE user_id = ?", userId);
    const events = getCount(
      "SELECT count(*) FROM timeline_events WHERE source_id IN (SELECT id FROM sources WHERE user_id = ?)",
      userId
    );
    db.close();
    return {
      total_entities: entities,
      total_relationships: relationships,
      total_sources: sources,
      total_events: events,
    };
  } catch {
    return null;
  }
}

/**
 * Load entity by id from local SQLite (same DB as Recent events). Used when API returns 404
 * so the user can still see entity details from local DB.
 */
async function getEntityFromLocalDb(
  repoRoot: string,
  preferredEnv: "dev" | "prod",
  userId: string,
  entityId: string
): Promise<Record<string, unknown> | null> {
  if (process.env.NEOTOMA_STORAGE_BACKEND && process.env.NEOTOMA_STORAGE_BACKEND !== "local") {
    return null;
  }
  const dataDir = path.join(repoRoot, "data");
  const dbFile = preferredEnv === "prod" ? "neotoma.prod.db" : "neotoma.db";
  const dbPath = path.join(dataDir, dbFile);
  try {
    await fs.access(dbPath);
  } catch {
    return null;
  }
  type Row = Record<string, unknown>;
  type DbInstance = {
    close: () => void;
    pragma: (sql: string) => void;
    prepare: (sql: string) => { get: (...args: unknown[]) => Row | undefined; all: (...args: unknown[]) => Row[] };
  };
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath) as unknown as DbInstance;
  db.pragma("busy_timeout = 2000");
  try {
    const entity = db.prepare(
      "SELECT id, entity_type, canonical_name, merged_to_entity_id FROM entities WHERE id = ? AND user_id = ?"
    ).get(entityId, userId) as Row | undefined;
    if (!entity) return null;
    const resolvedId = (entity.merged_to_entity_id as string) || entityId;
    let snapshot: Record<string, unknown> | null = null;
    try {
      const snap = db.prepare(
        "SELECT snapshot FROM entity_snapshots WHERE entity_id = ? AND user_id = ?"
      ).get(resolvedId, userId) as { snapshot?: unknown } | undefined;
      if (snap?.snapshot && typeof snap.snapshot === "object" && !Array.isArray(snap.snapshot)) {
        snapshot = snap.snapshot as Record<string, unknown>;
      }
    } catch {
      // entity_snapshots may not exist
    }
    return {
      id: entity.id,
      entity_type: entity.entity_type,
      canonical_name: entity.canonical_name,
      ...(snapshot ? { snapshot } : {}),
    };
  } finally {
    db.close();
  }
}

const WATCH_INITIAL_EVENT_LIMIT = 50;

/**
 * Last N watch entries: sourced from the local SQLite DB (same tables the watch command polls).
 * Returns WatchEvent[] for display with formatWatchTable (Recent events box).
 */
async function getLastNWatchEntries(
  repoRoot: string,
  preferredEnv: "dev" | "prod",
  userId: string | null,
  limit = 20
): Promise<WatchEvent[]> {
  if (process.env.NEOTOMA_STORAGE_BACKEND && process.env.NEOTOMA_STORAGE_BACKEND !== "local") {
    return [];
  }
  if (!userId) return [];
  const dataDir = path.join(repoRoot, "data");
  const dbFile = preferredEnv === "prod" ? "neotoma.prod.db" : "neotoma.db";
  const dbPath = path.join(dataDir, dbFile);
  try {
    await fs.access(dbPath);
  } catch {
    return [];
  }
  type Row = Record<string, unknown>;
  type DbInstance = {
    close: () => void;
    prepare: (sql: string) => { all: (...args: unknown[]) => Row[] };
    pragma: (s: string) => void;
  };
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath) as unknown as DbInstance;
  db.pragma("busy_timeout = 2000");
  const merged: { table: string; ts: string; id: string; row: Row }[] = [];
  try {
    for (const { table, idCol, tsCol, userFilter } of WATCH_ENTRY_TABLE_DEFS) {
      try {
        const userClause =
          userFilter === "source_user"
            ? "source_id IN (SELECT id FROM sources WHERE user_id = ?)"
            : "user_id = ?";
        const perTable = Math.max(5, Math.ceil(limit / WATCH_ENTRY_TABLE_DEFS.length) + 2);
        const sql = `SELECT * FROM ${table} WHERE ${tsCol} IS NOT NULL AND ${userClause} ORDER BY ${tsCol} DESC LIMIT ${perTable}`;
        const rows = db.prepare(sql).all(userId) as Row[];
        for (const row of rows) {
          const ts = String(row[tsCol] ?? "");
          const id = String(row[idCol] ?? "");
          if (ts && id) merged.push({ table, ts, id, row });
        }
      } catch {
        // Table may not exist or lack user_id / column
      }
    }
    merged.sort((a, b) => (b.ts < a.ts ? -1 : b.ts > a.ts ? 1 : 0));
    const topN = merged.slice(0, limit).reverse(); // oldest first so most recent at bottom
    const entityIds = new Set<string>();
    for (const { table, row } of topN) {
      const add = (k: string) => {
        const v = row[k];
        if (v && typeof v === "string") entityIds.add(v);
      };
      if (table === "observations") add("entity_id");
      else if (table === "relationship_observations" || table === "relationship_snapshots") {
        add("source_entity_id");
        add("target_entity_id");
      } else if (table === "entity_snapshots") add("entity_id");
      else if (table === "entity_merges") {
        add("from_entity_id");
        add("to_entity_id");
      }
    }
    const entityMeta = new Map<string, { entity_type: string; canonical_name: string }>();
    const entitySnapshot = new Map<string, Record<string, unknown>>();
    if (entityIds.size > 0) {
      const ph = Array.from(entityIds)
        .map(() => "?")
        .join(",");
      const entityRows = db.prepare(
        `SELECT id, entity_type, canonical_name FROM entities WHERE id IN (${ph}) AND user_id = ?`
      ).all(...entityIds, userId) as { id: string; entity_type: string; canonical_name: string }[];
      for (const r of entityRows) {
        entityMeta.set(r.id, { entity_type: r.entity_type, canonical_name: r.canonical_name });
      }
      try {
        const snapshotRows = db.prepare(
          `SELECT entity_id, snapshot FROM entity_snapshots WHERE entity_id IN (${ph}) AND user_id = ?`
        ).all(...entityIds, userId) as { entity_id: string; snapshot: unknown }[];
        for (const r of snapshotRows) {
          if (r.snapshot && typeof r.snapshot === "object" && !Array.isArray(r.snapshot)) {
            entitySnapshot.set(r.entity_id, r.snapshot as Record<string, unknown>);
          }
        }
      } catch {
        // entity_snapshots may not exist or column may differ
      }
    }
    const name = (id: string): string => {
      const meta = entityMeta.get(id);
      if (!meta) return id.slice(0, 12) + "…";
      const snapshot = entitySnapshot.get(id);
      return getEntityDisplayName({
        entity_type: meta.entity_type,
        canonical_name: meta.canonical_name,
        snapshot: snapshot ?? undefined,
      });
    };
    const formatSummary = (table: string, row: Row): string =>
      getRecordDisplaySummary(table, row as Record<string, unknown>, {
        getEntityDisplayName: name,
      });
    const entityTypeForRow = (table: string, row: Row): string => {
      const str = (k: string) => (row[k] != null ? String(row[k]).trim() : "");
      const meta = (entityId: string) => entityMeta.get(entityId)?.entity_type;
      if (table === "entities") return str("entity_type") || "entity";
      if (table === "observations") return (str("entity_type") || meta(str("entity_id"))) ?? "-";
      if (table === "entity_snapshots") return (str("entity_type") || meta(str("entity_id"))) ?? "-";
      if (table === "raw_fragments") return str("entity_type") || "-";
      if (table === "timeline_events") return str("event_type") || "event";
      if (table === "relationship_observations" || table === "relationship_snapshots")
        return str("relationship_type") || "relationship";
      if (table === "entity_merges")
        return (meta(str("from_entity_id")) || meta(str("to_entity_id"))) ?? "merge";
      if (table === "sources") return str("mime_type") || "source";
      if (table === "interpretations") return "interpretation";
      return "-";
    };
    const strVal = (r: Row, k: string): string | undefined => {
      const v = r[k];
      return v != null && typeof v === "string" ? v : undefined;
    };
    return topN.map(({ table, ts, id, row }) => {
      const out: WatchEvent = {
        ts,
        table,
        id,
        summary: formatSummary(table, row),
        actionLabel: TABLE_ACTION_LABEL[table] ?? table,
        entityType: entityTypeForRow(table, row),
      };
      if (table === "observations" || table === "entity_snapshots" || table === "raw_fragments") {
        out.entity_id = strVal(row, "entity_id");
      } else if (
        table === "relationship_observations" ||
        table === "relationship_snapshots"
      ) {
        out.source_entity_id = strVal(row, "source_entity_id");
        out.target_entity_id = strVal(row, "target_entity_id");
      } else if (table === "entity_merges") {
        out.from_entity_id = strVal(row, "from_entity_id");
        out.to_entity_id = strVal(row, "to_entity_id");
      } else if (table === "interpretations") {
        out.source_id = strVal(row, "source_id");
      }
      return out;
    });
  } finally {
    db.close();
  }
}

async function _getDirSizeBytes(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dirPath, e.name);
      if (e.isDirectory()) total += await _getDirSizeBytes(full);
      else {
        const st = await fs.stat(full).catch(() => null);
        if (st) total += st.size;
      }
    }
  } catch {
    // ignore
  }
  return total;
}

/** Fetch entities, relationships, sources, and timeline events count for intro. Returns null when server is unreachable.
 * When baseUrlOrPort is provided (e.g. from session startup), uses it directly instead of resolveBaseUrl
 * to avoid "Multiple API servers" errors when dev and prod both respond. */
async function fetchIntroStats(baseUrlOrPort?: string): Promise<{
  total_entities: number;
  total_relationships: number;
  total_sources: number;
  total_events: number;
} | null> {
  try {
    const baseUrl = baseUrlOrPort
      ? baseUrlOrPort.startsWith("http")
        ? baseUrlOrPort.replace(/\/$/, "")
        : `http://127.0.0.1:${baseUrlOrPort}`
      : (await resolveBaseUrl(program.opts().baseUrl, await readConfig())).replace(/\/$/, "");
    const token = await getCliToken();
    const api = createApiClient({ baseUrl, token });
    const { data, error } = await api.GET("/api/stats", {});
    if (error || !data) return null;
    const stats = data as {
      total_entities?: number;
      total_relationships?: number;
      sources_count?: number;
      total_events?: number;
    };
    return {
      total_entities: stats.total_entities ?? 0,
      total_relationships: stats.total_relationships ?? 0,
      total_sources: stats.sources_count ?? 0,
      total_events: stats.total_events ?? 0,
    };
  } catch {
    return null;
  }
}

function writeStatusLine(spinnerChar: string, status: string): void {
  process.stdout.write("\r" + BANNER_ANSI.clearLine + dim(spinnerChar) + " " + status);
}

/** Show spinner + message while running async fn; clear line when done. Returns fn result. */
async function runWithSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
  let frame = 0;
  writeStatusLine(INIT_SPINNER_FRAMES[0], message);
  const id = setInterval(() => {
    frame = (frame + 1) % INIT_SPINNER_FRAMES.length;
    writeStatusLine(INIT_SPINNER_FRAMES[frame], message);
  }, INIT_SPINNER_MS);
  try {
    return await fn();
  } finally {
    clearInterval(id);
    process.stdout.write("\r" + BANNER_ANSI.clearLine);
  }
}

/** Ctrl+D (EOT) and Cmd+D (ESC d on many Mac terminals) character codes. */
const CTRL_D = "\x04";
const ESC_D = "\u001bd";

/**
 * Install a stdin listener during init so Ctrl+D or Cmd+D cancels init and quits.
 * Only use when stdin is a TTY. Returns a cleanup function to remove the listener and restore stdin.
 */
function installInitCancelListener(onCancel: () => void): () => void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return () => {};
  const wasPaused = stdin.isPaused();
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let buffer = "";
  const onData = (chunk: string) => {
    buffer += chunk;
    if (buffer.includes(CTRL_D) || buffer.includes(ESC_D)) {
      cleanup();
      process.stdout.write("\r" + BANNER_ANSI.clearLine);
      onCancel();
    }
    if (buffer.length > 2) buffer = buffer.slice(-2);
  };
  const cleanup = () => {
    stdin.removeListener("data", onData);
    stdin.setRawMode(false);
    if (wasPaused) stdin.pause();
  };
  stdin.on("data", onData);
  return cleanup;
}

/** Run init steps with an animated status line; returns version and intro stats for the intro block.
 * When deferApiStats is true, skips API-dependent steps (checkApiStatusForIntro, fetchIntroStats).
 * Use deferApiStats when we will start the server or resolve the port later; intro is then
 * fetched after the server is up or the port is known. */
async function runInitWithStatus(options?: {
  deferApiStats?: boolean;
}): Promise<{
  version: string;
  intro: {
    total_entities: number;
    total_relationships: number;
    total_sources: number;
    total_events: number;
  } | null;
}> {
  const deferApiStats = options?.deferApiStats === true;
  let status = "Loading project…";
  let frame = 0;
  writeStatusLine(INIT_SPINNER_FRAMES[0], status);
  const id = setInterval(() => {
    frame = (frame + 1) % INIT_SPINNER_FRAMES.length;
    writeStatusLine(INIT_SPINNER_FRAMES[frame], status);
  }, INIT_SPINNER_MS);
  try {
    await ensureDevCommands();
    if (deferApiStats) {
      status = "Preparing session…";
      writeStatusLine(INIT_SPINNER_FRAMES[frame], status);
      const version = await getCliVersion();
      await new Promise((r) => setTimeout(r, 200));
      return { version, intro: null };
    }
    status = "Checking for running servers…";
    writeStatusLine(INIT_SPINNER_FRAMES[frame], status);
    await checkApiStatusForIntro();
    status = "Loading version and stats…";
    writeStatusLine(INIT_SPINNER_FRAMES[frame], status);
    const [version, intro] = await Promise.all([getCliVersion(), fetchIntroStats()]);
    status = "Data loaded.";
    writeStatusLine(INIT_SPINNER_FRAMES[frame], status);
    await new Promise((r) => setTimeout(r, 200));
    return { version, intro };
  } finally {
    clearInterval(id);
    process.stdout.write("\r" + BANNER_ANSI.clearLine);
  }
}

type IntroBoxContent = { lines: string[]; title: string };

function buildIntroBoxContent(
  version: string,
  intro: {
    total_entities: number;
    total_relationships: number;
    total_sources: number;
    total_events: number;
  } | null,
  serverLines?: string[],
  env?: "dev" | "prod"
): IntroBoxContent {
  const versionPart = dim(`v${version}`);
  const envPart = env != null ? dim(` ${env} `) : " ";
  const title = black(bold(" Neotoma ") + versionPart + envPart);
  const formatInt = (n: number): string =>
    Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(n);
  const statsLine =
    intro === null
      ? "Data unavailable"
      : `${formatInt(intro.total_entities)} entities, ${formatInt(intro.total_relationships)} relationships, ${formatInt(intro.total_sources)} sources, ${formatInt(intro.total_events)} timeline events`;
  const ratW = INTRO_PACK_RAT_DISPLAY_WIDTH;
  const ratSep = "  " + black("│") + " ";
  const blankRat = padToDisplayWidth("", ratW) + ratSep;
  // Stats on its own row (no art); then three art rows for Local, Tunnel, User so each server line appears once
  const contentLines: string[] = [
    blankRat,
    blankRat + dim(statsLine),
    padToDisplayWidth(INTRO_PACK_RAT_LINES[0], ratW) + ratSep + (serverLines?.[0] ?? ""),
    padToDisplayWidth(INTRO_PACK_RAT_LINES[1], ratW) + ratSep + (serverLines?.[1] ?? ""),
    padToDisplayWidth(INTRO_PACK_RAT_LINES[2], ratW) + ratSep + (serverLines?.[2] ?? ""),
  ];
  if (serverLines != null && serverLines.length > 3) {
    for (let i = 3; i < serverLines.length; i++) {
      contentLines.push(padToDisplayWidth("", ratW) + ratSep + serverLines[i]);
    }
  }
  const withInnerPadding = [...contentLines, blankRat];
  return { lines: withInnerPadding, title };
}

type McpConfigStatus = { path: string; hasDev: boolean; hasProd: boolean };

/**
 * Build the status block string (intro + optional watch + optional MCP) for redraw on SIGWINCH.
 * Returns output and line count so we know how many lines to clear before redraw.
 */
function buildStatusBlockOutput(
  opts: {
    introContent: IntroBoxContent;
    watchLines?: string[];
    watchEventCount?: number;
    mcpConfigs?: McpConfigStatus[] | null;
    formatMcpBox: (configs: McpConfigStatus[], width?: number) => string;
  },
  sessionBoxWidth: number
): { output: string; lineCount: number } {
  const parts: string[] = [];
  const introStr =
    "\n" +
    blackBox(opts.introContent.lines, {
      title: opts.introContent.title,
      borderColor: "black",
      padding: 2,
      minWidth: INTRO_MIN_WIDTH,
      sessionBoxWidth,
    }) +
    "\n";
  parts.push(introStr);
  if (opts.watchLines != null && opts.watchLines.length > 0) {
    parts.push(
      "\n" +
        blackBox(opts.watchLines, {
          title: " Recent events ",
          borderColor: "green",
          padding: 1,
          sessionBoxWidth,
        }) +
        "\n"
    );
    if (opts.watchEventCount != null) {
      parts.push(
        dim("  View details: enter row number (1–" + opts.watchEventCount + ") at the prompt.") + "\n\n"
      );
    }
  }
  if (opts.mcpConfigs != null && opts.mcpConfigs.length > 0) {
    parts.push("\n" + opts.formatMcpBox(opts.mcpConfigs, sessionBoxWidth) + "\n");
  }
  const output = parts.join("");
  const lineCount = output.split("\n").length;
  return { output, lineCount };
}

async function printIntroBlock(
  version: string,
  intro: {
    total_entities: number;
    total_relationships: number;
    total_sources: number;
    total_events: number;
  } | null,
  serverLines?: string[],
  env?: "dev" | "prod",
  options?: { sessionBoxWidth?: number; contentLines?: string[]; title?: string }
): Promise<void> {
  const { lines: withInnerPadding, title } =
    options?.contentLines != null && options?.title != null
      ? { lines: options.contentLines, title: options.title }
      : buildIntroBoxContent(version, intro, serverLines, env);
  const boxStr =
    "\n" +
    blackBox(withInnerPadding, {
      title,
      borderColor: "black",
      padding: 2,
      minWidth: INTRO_MIN_WIDTH,
      sessionBoxWidth: options?.sessionBoxWidth,
    }) +
    "\n";
  process.stdout.write(boxStr);

  if (process.stdout.isTTY && serverLines != null && serverLines.length > 1) {
    const pad = 2;
    const ratW = INTRO_PACK_RAT_DISPLAY_WIDTH;
    const ratSep = "  " + black("│") + " ";
    const rawContentWidth = Math.max(0, ...withInnerPadding.map((l) => displayWidth(l)));
    const contentWidth = rawContentWidth + 2 * pad;
    const titleLen = visibleLength(title);
    const innerWidth =
      options?.sessionBoxWidth ??
      Math.max(contentWidth, titleLen + 2, INTRO_MIN_WIDTH + 2 * pad);
    // (o.o) row is now Tunnel (serverLines[1])
    const faceContentOpen =
      padToDisplayWidth(INTRO_PACK_RAT_LINES[1], ratW) + ratSep + serverLines[1];
    const faceContentWink =
      padToDisplayWidth(INTRO_PACK_RAT_FACE_WINK, ratW) + ratSep + serverLines[1];
    const boxVertical = black("│");
    const padLeft = " ".repeat(pad);
    const buildFaceLine = (content: string) =>
      boxVertical +
      padLeft +
      content +
      " ".repeat(Math.max(0, innerWidth - pad - displayWidth(content))) +
      boxVertical;
    const faceLineOpen = buildFaceLine(faceContentOpen);
    const faceLineWink = buildFaceLine(faceContentWink);
    const totalBoxLines = withInnerPadding.length + 2;
    // (o.o) line is output line index 4 (0=top border). From line after bottom border, go up to reach it.
    const faceOutputLineIndex = 4;
    const linesUpToFace = totalBoxLines - faceOutputLineIndex;
    process.stdout.write(BANNER_ANSI.up(linesUpToFace));
    for (let i = 0; i < 2; i++) {
      process.stdout.write(faceLineWink + "\r");
      await new Promise((r) => setTimeout(r, INTRO_WINK_MS));
      process.stdout.write(faceLineOpen + "\r");
      await new Promise((r) => setTimeout(r, INTRO_WINK_MS));
    }
    process.stdout.write(faceLineOpen + BANNER_ANSI.down(linesUpToFace) + "\n");
  }
}

/** Exported for tests: top-level command names (same as session command list). */
export function getSessionCommandNames(): string[] {
  return getSessionCommands(program).map((c) => c.name);
}

/** True when argv has no command (only global options or empty). */
function hasNoCommand(args: string[]): boolean {
  if (args.length === 0) return true;
  const firstPositional = args.find((a) => a !== "--" && !a.startsWith("-"));
  return firstPositional === undefined;
}

/** Tee process.stdout and process.stderr to a log file. Used when --log-file is set. */
function teeToLogFile(logFilePath: string): void {
  try {
    const logStream = createWriteStream(logFilePath, { flags: "a" });
    logStream.on("error", () => {});
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    const writeToLog = (chunk: unknown, enc?: unknown, _cb?: unknown): void => {
      try {
        if (typeof chunk === "string") {
          if (typeof enc === "string") logStream.write(chunk, enc as BufferEncoding);
          else logStream.write(chunk);
        } else if (Buffer.isBuffer(chunk)) logStream.write(chunk);
      } catch {
        // ignore
      }
    };
    process.stdout.write = function (
      chunk: unknown,
      encodingOrCallback?: unknown,
      callback?: unknown
    ): boolean {
      writeToLog(chunk, encodingOrCallback, callback);
      if (typeof encodingOrCallback === "function") {
        return origStdoutWrite(chunk as string, encodingOrCallback as (err?: Error | null) => void);
      }
      const enc = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      const cb = typeof callback === "function" ? (callback as (err?: Error | null) => void) : undefined;
      if (enc !== undefined) {
        return origStdoutWrite(chunk as string, enc as BufferEncoding, cb);
      }
      return cb ? origStdoutWrite(chunk as string, cb) : origStdoutWrite(chunk as string);
    };
    process.stderr.write = function (
      chunk: unknown,
      encodingOrCallback?: unknown,
      callback?: unknown
    ): boolean {
      writeToLog(chunk, encodingOrCallback, callback);
      if (typeof encodingOrCallback === "function") {
        return origStderrWrite(chunk as string, encodingOrCallback as (err?: Error | null) => void);
      }
      const enc = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      const cb = typeof callback === "function" ? (callback as (err?: Error | null) => void) : undefined;
      if (enc !== undefined) {
        return origStderrWrite(chunk as string, enc as BufferEncoding, cb);
      }
      return cb ? origStderrWrite(chunk as string, cb) : origStderrWrite(chunk as string);
    };
  } catch {
    // do not break CLI if log file cannot be opened
  }
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const noLogFile = argv.includes("--no-log-file");
  const logFileIdx = argv.indexOf("--log-file");
  const explicitLogPath =
    logFileIdx >= 0 && argv[logFileIdx + 1] && !argv[logFileIdx + 1]!.startsWith("-")
      ? argv[logFileIdx + 1]!
      : null;
  const repoRootForLog = await findRepoRoot(process.cwd());
  const cliLogBasename = `cli.${process.pid}.log`;
  const defaultLogPath =
    isProd ? null : repoRootForLog
      ? path.join(repoRootForLog, "data", "logs", cliLogBasename)
      : path.join(CONFIG_DIR, cliLogBasename);
  const logFilePath = noLogFile ? null : explicitLogPath ?? defaultLogPath;
  if (logFilePath) {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true }).catch(() => {});
    teeToLogFile(logFilePath);
  }

  let version: string | null = null;
  let intro: {
    total_entities: number;
    total_relationships: number;
    total_sources: number;
    total_events: number;
  } | null = null;

  program.parseOptions(argv);
  const args = (program.args && program.args.length > 0) ? program.args : argv.slice(2);
  const noSession = argv.includes("--no-session");
  const noServers = argv.includes("--no-servers");
  const serversOpt = (program.opts() as { servers?: string }).servers;
  const background = argv.includes("--background");
  const tunnel = argv.includes("--tunnel");
  const noArgs = hasNoCommand(args);

  runUpdateNotifier();

  const serverPolicy =
    noArgs && !background && !noSession
      ? await resolveServerPolicy(noServers, serversOpt)
      : null;
  const startServers = serverPolicy === "start";
  const deferApiStats =
    serverPolicy === "start" || serverPolicy === "use-existing";

  if (process.stdout.isTTY) {
    const cleanupCancel = installInitCancelListener(() => process.exit(0));
    try {
      const init = await runInitWithStatus({ deferApiStats });
      version = init.version;
      intro = init.intro;
    } finally {
      cleanupCancel();
    }
  } else {
    await ensureDevCommands();
  }

  if (noArgs) {
    const wantsHelpOrVersion =
      argv.includes("--help") ||
      argv.includes("-h") ||
      argv.includes("--version") ||
      argv.includes("-V");
    if (!process.stdout.isTTY && !wantsHelpOrVersion) {
      process.stderr.write(
        "No command given. Run neotoma <command> (e.g. neotoma entities list). Use neotoma --help for options.\n"
      );
      process.exitCode = 1;
      return;
    }
    if (background) {
      const repoResult = await loadNpmScripts().catch(() => null);
      if (!repoResult) {
        process.stderr.write(
          "Not a Neotoma repo. Run from the repo root (package.json name must be 'neotoma').\n"
        );
        return;
      }
      const { repoRoot } = repoResult;
      const [devPort, prodPort] = await pickSessionPorts(repoRoot);
      const { devPid, prodPid } = spawnDevProdServersDetached(repoRoot, devPort, prodPort, tunnel);
      const state: BackgroundServersState = {
        devPid,
        prodPid,
        devPort,
        prodPort,
        repoRoot,
        startedAt: new Date().toISOString(),
      };
      await fs.mkdir(path.dirname(BACKGROUND_SERVERS_PATH), { recursive: true });
      await fs.writeFile(BACKGROUND_SERVERS_PATH, JSON.stringify(state, null, 2));
      process.stdout.write(success("Servers started in background.") + "\n");
      process.stdout.write(
        dim("Dev ") +
          pathStyle(`http://127.0.0.1:${devPort}`) +
          dim(" (PID ") +
          String(devPid) +
          dim(")") +
          "\n"
      );
      process.stdout.write(
        dim("Prod ") +
          pathStyle(`http://127.0.0.1:${prodPort}`) +
          dim(" (PID ") +
          String(prodPid) +
          dim(")") +
          "\n"
      );
      process.stdout.write(
        dim("MCP (HTTP):") +
          pathStyle(`http://127.0.0.1:${devPort}/mcp`) +
          dim("  Prod MCP :") +
          pathStyle(`http://127.0.0.1:${prodPort}/mcp`) +
          "\n"
      );
      if (tunnel) {
        const logsDir = path.join(repoRoot, "data", "logs");
        process.stdout.write(
          dim("Tunnel: dev and prod each start an HTTPS tunnel; URLs and logs in ") +
            pathStyle(logsDir) +
            dim(" (tunnel-dev-url.txt, tunnel-prod-url.txt, *.log).") +
            "\n"
        );
      } else {
        process.stdout.write(dim("Tunnel: off (use ") + pathStyle("neotoma --tunnel") + dim(" to enable).") + "\n");
      }
      process.stdout.write(dim("Stop with: ") + pathStyle("neotoma stop") + "\n");
      return;
    }

    if (noSession) {
      debugLog("No-session mode: showing intro panel and command menu (no REPL)");
      const apiStatus = await checkApiStatusForIntro();
      const apiLine =
        apiStatus.ok && apiStatus.baseUrl != null
          ? bold("API: ") +
            success("up") +
            " " +
            pathStyle(apiStatus.baseUrl) +
            (apiStatus.latencyMs != null ? dim(` ${apiStatus.latencyMs} ms`) : "")
          : bold("API: ") +
            warn("down") +
            (apiStatus.baseUrl ? " " + pathStyle(apiStatus.baseUrl) : "") +
            (apiStatus.error ? " " + dim(apiStatus.error) : "");

      const summary = apiStatus.ok ? await fetchStorageSummary() : null;
      const cwd = pathStyle(process.cwd());

      const panelLines: string[] = [];
      panelLines.push(...nestArt().split("\n"));
      panelLines.push("");
      panelLines.push(apiLine);
      if (summary) {
        panelLines.push("");
        panelLines.push(subHeading("Storage summary"));
        panelLines.push(...summary.split("\n"));
      }
      panelLines.push("");
      panelLines.push(subHeading("Tips for getting started"));
      panelLines.push(
        bullet(
          "Run " +
            pathStyle("neotoma <command>") +
            " (e.g. " +
            pathStyle("neotoma storage info") +
            ")"
        )
      );
      panelLines.push(bullet("Start API: " + pathStyle("neotoma api start")));
      panelLines.push(bullet("Configure MCP: " + pathStyle("neotoma mcp config")));
      panelLines.push("");
      panelLines.push(dim("Cwd: ") + cwd);

      process.stdout.write(panel(panelLines, { title: "Neotoma", padding: 2, width: 52 }) + "\n\n");
      await runCommandMenuLoop();
      return;
    }

    if (isDebug()) {
      process.stderr.write(
        dim(
          `[debug] Server policy: ${serverPolicy}, startServers: ${startServers}\n`
        )
      );
    }
    let devChild: ReturnType<typeof spawn> | null = null;
    let prodChild: ReturnType<typeof spawn> | null = null;
    let sessionRepoRoot: string | undefined;
    /** When this run started the server, path to that run's session log (session.<pid>.log). */
    let currentSessionLogPath: string | undefined;
    /** User ID from /api/me, used for watch events and local-DB fallback in session. */
    let userIdForWatch: string | null = null;
    let storedMcpConfigs: { path: string; hasDev: boolean; hasProd: boolean }[] | null = null;
    let storedMcpRepoRoot: string | null = null;
    let storedSessionBoxWidth: number | undefined;
    let storedStatusBlockRedrawData: {
      introContent: IntroBoxContent;
      watchLines?: string[];
      watchEventCount?: number;
      mcpConfigs: McpConfigStatus[];
      baseSessionBoxWidth: number;
      formatMcpBox: (configs: McpConfigStatus[], width?: number) => string;
    } | null = null;

    // Preferred environment: from --env flag, or always prompt (no saved default)
    let preferredEnv: "dev" | "prod";
    const envFlag = program.opts().env as string | undefined;
    if (envFlag === "dev" || envFlag === "prod") {
      preferredEnv = envFlag;
      debugLog(`Preferred environment from --env: ${preferredEnv}`);
    } else if (startServers) {
      if (process.stdout.isTTY) {
        debugLog("No --env flag; prompting user for environment");
        process.stdout.write("\n" + bold("Load which environment?") + "\n");
        process.stdout.write(dim("1) dev (port 8080)") + "\n");
        process.stdout.write(dim("2) prod (port 8180)") + "\n");
        const answer = await askQuestion("> ");
        if (answer === "2" || answer.toLowerCase() === "prod") {
          preferredEnv = "prod";
        } else {
          preferredEnv = "dev";
        }
        debugLog(`User selected: ${preferredEnv}`);
      } else {
        process.stderr.write(
          "neotoma: no environment specified. Use --env dev or --env prod.\n"
        );
        process.exit(1);
        preferredEnv = "dev"; // unreachable; satisfy TypeScript
      }
    } else {
      // use-existing: env is determined later when connecting to a running server
      preferredEnv = "dev"; // temporary; overridden below
    }
    process.env.NEOTOMA_SESSION_ENV = preferredEnv;

    if (startServers) {
      debugLog("Loading project (package.json, npm scripts)…");
      const loadRepo = (): Promise<{ repoRoot: string; scripts: NpmScript[] } | null> =>
        loadNpmScripts().catch(() => null);
      let repoResult = process.stdout.isTTY
        ? await runWithSpinner("Loading project…", loadRepo)
        : await loadRepo();
      if (repoResult) {
        debugLog(`Repo root: ${repoResult.repoRoot}`);
      }
      if (!repoResult) {
        const runInit = await askYesNo(
          "No Neotoma repo found. Run " +
            pathStyle("neotoma init") +
            " now to set up and set repo path? (y/n) "
        );
        if (runInit) {
          const child = spawn(process.argv[0], [process.argv[1], "init"], {
            cwd: process.cwd(),
            stdio: "inherit",
            env: { ...process.env },
          });
          const exitCode = await new Promise<number | null>((res) => child.on("close", res));
          if (exitCode === 0) {
            repoResult = await loadNpmScripts().catch(() => null);
          }
        }
      }
      if (repoResult) {
        const { repoRoot } = repoResult;
        sessionRepoRoot = repoRoot;
        const startServersWork = async (): Promise<{
          port: number;
          env: "dev" | "prod";
          sessionPortPath: string;
          sessionLogPath: string;
        }> => {
          debugLog("Picking session ports (scripts/pick-port.js)…");
          const [devPort, prodPort] = await pickSessionPorts(repoRoot);
          debugLog(`Ports: dev=${devPort}, prod=${prodPort}`);
          const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
          const sessionLogDir = path.join(repoRoot, "data", "logs");
          const sessionLogPath = path.join(sessionLogDir, `session-${preferredEnv}.log`);
          const sessionPortPath = path.join(sessionLogDir, "session.port");
          await fs.mkdir(sessionLogDir, { recursive: true });
          const logFd = await fs.open(sessionLogPath, "a");
          const logStream = logFd.createWriteStream();
          const header =
            "\n--- neotoma session " + preferredEnv + " (" + new Date().toISOString() + ") ---\n";
          logStream.write(header);
          const onExit = (): void => {
            logStream.end();
          };

          const watchArgs = tunnel ? WATCH_CONCURRENTLY_ARGS_TUNNEL : WATCH_CONCURRENTLY_ARGS;
          const devEnv: NodeJS.ProcessEnv = {
            ...process.env,
            HTTP_PORT: String(devPort),
            NEOTOMA_SESSION_PORT_FILE: sessionPortPath,
            ...(tunnel && {
              TUNNEL_NONINTERACTIVE: "1",
              NGROK_URL_FILE: getTunnelUrlFile(repoRoot, "dev"),
              NGROK_PID_FILE: getTunnelPidFile(repoRoot, "dev"),
            }),
          };
          const prodEnv: NodeJS.ProcessEnv = {
            ...process.env,
            HTTP_PORT: String(prodPort),
            NEOTOMA_SESSION_PORT_FILE: sessionPortPath,
            NEOTOMA_ENV: "production",
            ...(tunnel && {
              TUNNEL_NONINTERACTIVE: "1",
              NGROK_URL_FILE: getTunnelUrlFile(repoRoot, "prod"),
              NGROK_PID_FILE: getTunnelPidFile(repoRoot, "prod"),
            }),
          };
          if (preferredEnv === "dev") {
            process.env.NEOTOMA_SESSION_DEV_PORT = String(devPort);
            debugLog(
              `Spawning dev server: npx concurrently (${tunnel ? "tunnel + run-dev-server-with-tunnel-url.sh + " : ""}tsc --watch), HTTP_PORT=${devPort}`
            );
            debugLog(`Server stdout/stderr logged to ${sessionLogPath}`);
            devChild = spawn(npxCmd, ["concurrently", ...watchArgs], {
              cwd: repoRoot,
              stdio: ["ignore", logStream, logStream],
              env: devEnv,
              shell: false,
            });
            devChild.on("error", (err) => {
              process.stderr.write(`neotoma: dev server error: ${err.message}\n`);
            });
            devChild.on("close", onExit);
            debugLog(`Dev server process started (pid ${devChild.pid ?? "?"})`);
            return { port: devPort, env: "dev", sessionPortPath, sessionLogPath };
          } else {
            process.env.NEOTOMA_SESSION_PROD_PORT = String(prodPort);
            debugLog(
              `Spawning prod server: npx concurrently (${tunnel ? "tunnel + run-dev-server-with-tunnel-url.sh + " : ""}tsc --watch), HTTP_PORT=${prodPort}, NEOTOMA_ENV=production`
            );
            debugLog(`Server stdout/stderr logged to ${sessionLogPath}`);
            prodChild = spawn(npxCmd, ["concurrently", ...watchArgs], {
              cwd: repoRoot,
              stdio: ["ignore", logStream, logStream],
              env: prodEnv,
              shell: false,
            });
            prodChild.on("error", (err) => {
              process.stderr.write(`neotoma: prod server error: ${err.message}\n`);
            });
            prodChild.on("close", onExit);
            debugLog(`Prod server process started (pid ${prodChild.pid ?? "?"})`);
            return { port: prodPort, env: "prod", sessionPortPath, sessionLogPath };
          }
        };
        const result = process.stdout.isTTY
          ? await runWithSpinner(`Starting ${preferredEnv} server…`, startServersWork)
          : await startServersWork();
        currentSessionLogPath = result.sessionLogPath;
        const actualPort = await waitForSessionPortFile(result.sessionPortPath, result.port, {
          timeoutMs: 15000,
          intervalMs: 500,
        });
        if (actualPort !== result.port) {
          debugLog(`Session port file reported ${actualPort} (preferred was ${result.port})`);
        }
        if (result.env === "dev") {
          process.env.NEOTOMA_SESSION_DEV_PORT = String(actualPort);
        } else {
          process.env.NEOTOMA_SESSION_PROD_PORT = String(actualPort);
        }
        debugLog(
          `Waiting for local server at http://127.0.0.1:${actualPort}/health (timeout 45s, interval 800ms)`
        );
        const healthy = process.stdout.isTTY
          ? await runWithSpinner(`Waiting for local server (${result.env})…`, () =>
              waitForHealth(actualPort, { timeoutMs: 45000, intervalMs: 800 })
            )
          : await waitForHealth(actualPort, { timeoutMs: 45000, intervalMs: 800 });
        let ready = healthy;
        if (healthy) {
          debugLog("Health ok; waiting for API to serve /api/me (timeout 20s, interval 500ms)");
          ready = process.stdout.isTTY
            ? await runWithSpinner(`Waiting for API (${result.env})…`, () =>
                waitForApiReady(actualPort, { timeoutMs: 20000, intervalMs: 500 })
              )
            : await waitForApiReady(actualPort, { timeoutMs: 20000, intervalMs: 500 });
        }
        debugLog(
          ready
            ? "Server and API ready (health + /api/me responded)"
            : "Server did not become ready in time"
        );
        if (!ready) {
          intro = null;
          process.stderr.write(
            warn("Server did not become ready in time. Commands may fail until it is up.\n")
          );
          const sessionLogPath =
            currentSessionLogPath ??
            path.join(sessionRepoRoot, "data", "logs", `session-${result.env}.log`);
          const logTail = await readLastLines(sessionLogPath, 40);
          if (logTail) {
            process.stderr.write("\n" + subHeading("Server output") + "\n");
            process.stderr.write(dim(logTail) + "\n\n");
          }
          process.stderr.write(dim("Full log: ") + pathStyle(sessionLogPath) + "\n");
        } else if (version != null) {
          debugLog("Fetching intro stats (entities, relationships, sources)…");
          intro = await fetchIntroStats(String(actualPort));
        }
        let tunnelUrl: string | null = null;
        if (tunnel && sessionRepoRoot) {
          const tunnelFile = getTunnelUrlFile(sessionRepoRoot, result.env);
          debugLog(`Reading tunnel URL from ${tunnelFile}`);
          const waitForTunnelUrl = async (): Promise<string | null> => {
            for (let w = 0; w < 20; w++) {
              try {
                const raw = await fs.readFile(tunnelFile, "utf-8");
                const url = raw.trim() || null;
                if (url) return url;
              } catch {
                // file not ready
              }
              if (w < 19) await new Promise((r) => setTimeout(r, 500));
            }
            return null;
          };
          tunnelUrl = process.stdout.isTTY
            ? await runWithSpinner("Waiting for tunnel URL…", waitForTunnelUrl)
            : await waitForTunnelUrl();
          debugLog(
            tunnelUrl
              ? `Tunnel URL: ${tunnelUrl}`
              : "Tunnel URL file not ready (intro shows unreachable)"
          );
        }
        const localLabel =
          dim("Local: ") +
          pathStyle(`127.0.0.1:${actualPort}`) +
          (ready ? "" : " " + dim("(unreachable)"));
        const serverLines: string[] = [localLabel];
        if (tunnel) {
          if (tunnelUrl != null) {
            serverLines.push(dim("Tunnel: ") + pathStyle(tunnelUrl));
          } else {
            const tunnelLogPath =
              sessionRepoRoot ? getTunnelLogPath(sessionRepoRoot, result.env) : null;
            serverLines.push(
              dim("Tunnel: ") +
                dim("(not ready)") +
                (tunnelLogPath
                  ? dim(" — check ") + pathStyle(tunnelLogPath)
                  : dim(" — check tunnel script output"))
            );
          }
        } else {
          serverLines.push(
            dim("Tunnel: ") + dim("off") + dim(" (use ") + pathStyle("neotoma --tunnel") + dim(" to enable)")
          );
        }
        let userLine: string;
        try {
          debugLog("Resolving CLI token for /api/me…");
          const token = await getCliToken();
          const meHeaders: Record<string, string> = {};
          if (token) meHeaders.Authorization = `Bearer ${token}`;
          debugLog(`Fetching http://127.0.0.1:${actualPort}/api/me`);
          const meRes = await fetch(`http://127.0.0.1:${actualPort}/api/me`, {
            headers: meHeaders,
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as { user_id?: string };
            if (me.user_id) {
              debugLog(`User id: ${me.user_id}`);
              userIdForWatch = me.user_id;
              userLine = dim("User: ") + pathStyle(me.user_id);
            } else {
              debugLog("API /api/me ok but no user_id in response");
              userLine = dim("User: ") + dim("(none: no user_id in response)");
            }
          } else if (meRes.status === 401) {
            debugLog("API /api/me returned 401 (not signed in)");
            userLine = dim("User: ") + dim("(none: not signed in)");
          } else {
            debugLog(`API /api/me returned ${meRes.status}`);
            userLine = dim("User: ") + dim(`(none: API ${meRes.status})`);
          }
        } catch (err) {
          const reason =
            err instanceof Error && (err.message.includes("token") || err.message.includes("auth"))
              ? "no auth"
              : "API unreachable";
          debugLog(`User id failed: ${err instanceof Error ? err.message : String(err)}`);
          userLine = dim("User: ") + dim(`(none: ${reason})`);
        }
        serverLines.push(userLine);
        if (sessionRepoRoot) {
          const dataDir = process.env.NEOTOMA_DATA_DIR || path.join(sessionRepoRoot, "data");
          const dbFile = result.env === "prod" ? "neotoma.prod.db" : "neotoma.db";
          const dbPathRaw =
            process.env.NEOTOMA_SQLITE_PATH || path.join(dataDir, dbFile);
          const dbPath = path.isAbsolute(dbPathRaw)
            ? dbPathRaw
            : path.join(sessionRepoRoot, dbPathRaw);
          serverLines.push(dim("DB: ") + pathStyle(dbPath));
          const sessionLogPath =
            currentSessionLogPath ??
            path.join(sessionRepoRoot, "data", "logs", `session-${result.env}.log`);
          serverLines.push(dim("Server log: ") + pathStyle(sessionLogPath));
          serverLines.push(dim("CLI log: ") + pathStyle(logFilePath ?? CLI_LOG_PATH));
        }
        if (version != null && sessionRepoRoot) {
          const apiAllZeros =
            intro != null &&
            intro.total_entities === 0 &&
            intro.total_relationships === 0 &&
            intro.total_sources === 0 &&
            intro.total_events === 0;
          if (apiAllZeros && userIdForWatch) {
            const localIntro = await getLocalIntroStats(
              sessionRepoRoot,
              result.env,
              userIdForWatch
            );
            if (localIntro) intro = localIntro;
          }
          const introContent = buildIntroBoxContent(
            version,
            intro,
            serverLines,
            result.env
          );
          const {
            scanForMcpConfigs,
            getMcpStatusBoxLines,
            formatMcpStatusBox,
            MCP_STATUS_BOX_TITLE,
          } = await import("./mcp_config_scan.js");
          const devPortEnv = process.env.NEOTOMA_SESSION_DEV_PORT;
          const prodPortEnv = process.env.NEOTOMA_SESSION_PROD_PORT;
          const devPort =
            devPortEnv && /^\d+$/.test(devPortEnv)
              ? parseInt(devPortEnv, 10)
              : undefined;
          const prodPort =
            prodPortEnv && /^\d+$/.test(prodPortEnv)
              ? parseInt(prodPortEnv, 10)
              : undefined;
          const { configs: mcpConfigs, repoRoot: mcpRepoRoot } =
            await scanForMcpConfigs(process.cwd(), {
              includeUserLevel: true,
              userLevelFirst: true,
              devPort,
              prodPort,
              neotomaRepoRoot: sessionRepoRoot,
            });
          const mcpLines = getMcpStatusBoxLines(mcpConfigs);
          const rawSessionBoxWidth = Math.max(
            computeBoxInnerWidth(introContent.lines, {
              title: introContent.title,
              padding: 2,
            }),
            mcpLines.length > 0
              ? computeBoxInnerWidth(mcpLines, {
                  title: MCP_STATUS_BOX_TITLE,
                  padding: 1,
                })
              : 0
          );
          const sessionBoxWidth = Math.min(rawSessionBoxWidth, getTerminalWidth());
          await printIntroBlock(version, intro, serverLines, result.env, {
            sessionBoxWidth,
            contentLines: introContent.lines,
            title: introContent.title,
          });
          storedMcpConfigs = mcpConfigs;
          storedMcpRepoRoot = mcpRepoRoot;
          storedSessionBoxWidth = sessionBoxWidth;
          storedStatusBlockRedrawData = {
            introContent,
            mcpConfigs,
            baseSessionBoxWidth: sessionBoxWidth,
            formatMcpBox: formatMcpStatusBox,
          };
        } else if (version != null) {
          await printIntroBlock(version, intro, serverLines, result.env);
        }
        if (ready) {
          const baseUrl = `http://127.0.0.1:${actualPort}`;
          try {
            debugLog("Ensuring session or auth (OAuth flow if needed)…");
            await ensureSessionOrAuth(baseUrl);
            debugLog("Session/auth ready");
          } catch (err) {
            debugLog(`Session/auth failed: ${err instanceof Error ? err.message : String(err)}`);
            const msg = humanReadableApiError(err, true);
            process.stderr.write(warn("Could not establish session: " + msg + "\n"));
          }
        }
      } else {
        sessionRepoRoot = undefined;
        debugLog("No Neotoma repo found; session only (no servers)");
        if (version != null) await printIntroBlock(version, intro, undefined, preferredEnv);
        process.stdout.write(
          dim("Not in a Neotoma repo. Session only (no servers). Run from repo root, run ") +
            pathStyle("neotoma init") +
            dim(", or set NEOTOMA_REPO_ROOT to start dev/prod servers.") +
            "\n\n"
        );
      }
    } else {
      sessionRepoRoot = undefined;
      debugLog("Use-existing: probing for running API on 8180, 8080");
      const runningPorts = await detectRunningApiPorts();
      if (runningPorts.length === 0) {
        process.stderr.write(
          warn("No API reachable on 8180 or 8080. ") +
            "Start with " +
            pathStyle("neotoma api start") +
            " or run with " +
            pathStyle("--servers=start") +
            " to start for this session.\n"
        );
        process.exit(1);
      }
      const sortedPorts = [...runningPorts].sort((a, b) => a - b);
      let preferredPort: number;
      if (sortedPorts.length === 1) {
        preferredPort = sortedPorts[0]!;
      } else {
        process.stdout.write("\n" + bold("Which instance?") + "\n");
        sortedPorts.forEach((p, i) => {
          const label = p === 8180 ? "prod" : "dev";
          process.stdout.write(dim(`  ${i + 1}) `) + pathStyle(`127.0.0.1:${p}`) + dim(` (${label})\n`));
        });
        const which = await askQuestion(dim(`  [1-${sortedPorts.length}] > `));
        const idx = parseInt(which.trim(), 10);
        const oneBased = Number.isFinite(idx) && idx >= 1 && idx <= sortedPorts.length ? idx - 1 : 0;
        preferredPort = sortedPorts[oneBased]!;
      }
      const useExistingEnv = preferredPort === 8180 ? "prod" : "dev";
      if (useExistingEnv === "dev") {
        process.env.NEOTOMA_SESSION_DEV_PORT = String(preferredPort);
      } else {
        process.env.NEOTOMA_SESSION_PROD_PORT = String(preferredPort);
      }
      const actualPort = preferredPort;
      intro = await fetchIntroStats(String(actualPort));
      const localLabel =
        dim("Local: ") + pathStyle(`127.0.0.1:${actualPort}`) + dim(" (use-existing)");
      const serverLines: string[] = [
        localLabel,
        dim("Tunnel: ") + dim("off") + dim(" (use ") + pathStyle("neotoma --tunnel") + dim(" to enable)"),
      ];
      let userLine: string;
      try {
        const token = await getCliToken();
        const meRes = await fetch(`http://127.0.0.1:${actualPort}/api/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (meRes.ok) {
          const me = (await meRes.json()) as { user_id?: string };
          userLine = me.user_id
            ? dim("User: ") + pathStyle(me.user_id)
            : dim("User: ") + dim("(none: no user_id in response)");
        } else if (meRes.status === 401) {
          userLine = dim("User: ") + dim("(none: not signed in)");
        } else {
          userLine = dim("User: ") + dim(`(none: API ${meRes.status})`);
        }
      } catch {
        userLine = dim("User: ") + dim("(none: API unreachable)");
      }
      serverLines.push(userLine);
      if (version != null) {
        await printIntroBlock(version, intro, serverLines, useExistingEnv);
      }
      try {
        await ensureSessionOrAuth(`http://127.0.0.1:${actualPort}`);
      } catch (err) {
        const msg = humanReadableApiError(err, true);
        process.stderr.write(warn("Could not establish session: " + msg + "\n"));
      }
      preferredEnv = useExistingEnv;
      process.env.NEOTOMA_SESSION_ENV = useExistingEnv;
    }

    if (process.stdout.isTTY && sessionRepoRoot) {
      try {
        const { scanForMcpConfigs, offerInstall, formatMcpStatusBox } = await import(
          "./mcp_config_scan.js"
        );
        const devPortEnv = process.env.NEOTOMA_SESSION_DEV_PORT;
        const prodPortEnv = process.env.NEOTOMA_SESSION_PROD_PORT;
        const devPort =
          devPortEnv && /^\d+$/.test(devPortEnv) ? parseInt(devPortEnv, 10) : undefined;
        const prodPort =
          prodPortEnv && /^\d+$/.test(prodPortEnv) ? parseInt(prodPortEnv, 10) : undefined;
        let configs = storedMcpConfigs;
        let repoRoot = storedMcpRepoRoot;
        const sessionBoxWidth = storedSessionBoxWidth;
        if (configs == null || repoRoot == null) {
          const scan = await scanForMcpConfigs(process.cwd(), {
            includeUserLevel: true,
            userLevelFirst: true,
            devPort,
            prodPort,
            neotomaRepoRoot: sessionRepoRoot,
          });
          configs = scan.configs;
          repoRoot = scan.repoRoot;
        }
        // Always show MCP config status when we have configs; only prompt to install when current env is missing
        if (configs.length > 0) {
          process.stdout.write(
            formatMcpStatusBox(configs, sessionBoxWidth ?? undefined) + "\n"
          );
          const missingAny = configs.some((c) =>
            preferredEnv === "dev" ? !c.hasDev : !c.hasProd
          );
          if (missingAny) {
            await offerInstall(configs, repoRoot, {
              devPort,
              prodPort,
              cwd: process.cwd(),
              boxAlreadyShown: true,
              currentEnv: preferredEnv,
            });
          }
        }
      } catch {
        // Non-fatal; session continues
      }
    }

    // cli-instructions auto-check: silently update env section in existing rule files;
    // offer to add if no rule file is present yet (TTY only).
    if (sessionRepoRoot) {
      try {
        const { autoUpdateCliInstructionsEnv } = await import("./agent_instructions_scan.js");
        await autoUpdateCliInstructionsEnv(sessionRepoRoot, preferredEnv);
      } catch {
        // Non-fatal; session continues
      }
      if (process.stdout.isTTY) {
        try {
          const { scanAgentInstructions, offerAddPreferCliRule } = await import(
            "./agent_instructions_scan.js"
          );
          const agentScan = await scanAgentInstructions(sessionRepoRoot);
          if (agentScan.missingInApplied) {
            await offerAddPreferCliRule(agentScan, { env: preferredEnv });
          }
        } catch {
          // Non-fatal; session continues
        }
      }
    }

    debugLog("Starting session REPL (runSessionLoop)");
    const suggestionLinesRef = { current: 0 };
    const lastReadyPhraseRef = { current: SESSION_READY_PHRASES[0]! };
    let redrawStatusBlock: RedrawStatusBlockFn | undefined;
    let statusBlockLineCount: number | undefined;
    if (storedStatusBlockRedrawData != null) {
      const data = storedStatusBlockRedrawData;
      redrawStatusBlock = (_currentBuffer: string) => {
        const newWidth = Math.min(data.baseSessionBoxWidth, getTerminalWidth());
        const dataWithWatch =
          sessionWatchDisplayRef != null
            ? {
                ...data,
                watchLines: sessionWatchDisplayRef.watchLines,
                watchEventCount: sessionWatchDisplayRef.watchEventCount,
              }
            : data;
        const { output } = buildStatusBlockOutput(dataWithWatch, newWidth);
        process.stdout.write(output);
      };
      const { lineCount } = buildStatusBlockOutput(
        storedStatusBlockRedrawData,
        storedSessionBoxWidth ?? getTerminalWidth()
      );
      statusBlockLineCount = lineCount;
    }
    await runSessionLoop({
      onExit: () => {
        if (devChild) devChild.kill("SIGTERM");
        if (prodChild) prodChild.kill("SIGTERM");
      },
      repoRoot: sessionRepoRoot,
      preferredEnv,
      userId: userIdForWatch ?? undefined,
      redrawStatusBlock,
      statusBlockLineCount,
      suggestionLinesRef,
      lastReadyPhraseRef,
    });
    return;
  }
  const TOP_LEVEL_COMMANDS = new Set([
    "auth",
    "api",
    "backup",
    "dev",
    "entities",
    "logs",
    "mcp",
    "observations",
    "relationships",
    "schemas",
    "sources",
    "storage",
    "timeline",
  ]);
  const normalizedArgv =
    argv.length > 0 && TOP_LEVEL_COMMANDS.has(argv[0]) ? ["node", "neotoma", ...argv] : argv;
  await program.parseAsync(normalizedArgv);
}

const entryPath = process.argv[1];
let isMain = false;
if (typeof entryPath === "string") {
  try {
    const resolvedArgv = realpathSync(entryPath);
    const resolvedModule = realpathSync(fileURLToPath(import.meta.url));
    isMain = resolvedArgv === resolvedModule;
  } catch {
    isMain = pathToFileURL(entryPath).href === import.meta.url;
  }
}
if (isMain) {
  runCli(process.argv).catch((err: unknown) => {
    writeCliError(err);
    process.exit(1);
  });
}
