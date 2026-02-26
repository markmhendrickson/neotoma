#!/usr/bin/env node
import { Command } from "commander";
import { createHash, randomBytes } from "node:crypto";
import { exec, execSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWriteStream } from "node:fs";
import { realpathSync } from "node:fs";
import * as readline from "node:readline";
import Database from "better-sqlite3";

import { config as appConfig } from "../config.js";
import { getMcpAuthToken } from "../crypto/mcp_auth_token.js";
import { LOCAL_DEV_USER_ID } from "../services/local_auth.js";
import { createApiClient } from "../shared/api_client.js";
import { getOpenApiOperationMapping } from "../shared/contract_mappings.js";
import { getEntityDisplayName } from "../shared/entity_display_name.js";
import { getRecordDisplaySummary } from "../shared/record_display_summary.js";
import {
  CONFIG_DIR,
  CONFIG_PATH,
  CANDIDATE_API_PORTS,
  clearConfig,
  discoverApiInstances,
  isTokenExpired,
  isProd,
  readConfig,
  rememberKnownApiPort,
  resolveBaseUrl,
  waitForApiReady,
  waitForHealth,
  writeConfig,
  type ApiInstance,
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
  error as _errorStyle,
  getTerminalWidth,
  heading,
  keyValue,
  nl,
  numbered,
  padToDisplayWidth,
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

export function getPromptPlaceholder(buffer: string, placeholderText = "/ for commands"): string {
  return placeholderText.length > 0 && buffer.length === 0 ? placeholderText : "";
}

/**
 * Cursor math for live "/" suggestions.
 * We print a leading newline before the suggestions block, so we must move up
 * one extra line after rendering. Missing this +1 causes prompt line stacking.
 */
export function getSlashSuggestionCursorUpLines(renderedSuggestionLines: number): number {
  return Math.max(0, renderedSuggestionLines) + 1;
}

/**
 * Parse "view details" row selections from session input.
 * Accepts plain numbers plus slash variants users can reach via autocomplete.
 */
export function parseWatchRowSelection(input: string): number {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const slashNumber = trimmed.match(/^\/\s*(\d+)$/);
  if (slashNumber) return parseInt(slashNumber[1]!, 10);
  const slashListNumber = trimmed.match(/^\/\s*list\s+(\d+)$/i);
  if (slashListNumber) return parseInt(slashListNumber[1]!, 10);
  return 0;
}

export function getWatchEventCount<T>(events: T[]): number | undefined {
  return events.length > 0 ? events.length : undefined;
}

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
  historyRef?: SessionHistoryRef,
  placeholderText = "/ for commands"
): void {
  const stdin = process.stdin;
  const wasPaused = stdin.isPaused();
  if (suggestionLinesRef) suggestionLinesRef.current = 0;
  const useReadline =
    !stdin.isTTY ||
    process.env.NEOTOMA_USE_READLINE === "1" ||
    process.env.NEOTOMA_USE_READLINE === "true";
  if (useReadline) {
    const rl = readline.createInterface({ input: stdin, output: process.stdout });
    if (historyRef && Array.isArray(historyRef.history) && historyRef.history.length > 0) {
      (rl as readline.ReadLine & { history?: string[] }).history = [...historyRef.history];
    }
    const initialHint = getPromptPlaceholder("", placeholderText);
    const readlinePrompt =
      initialHint.length > 0 ? `${promptPrefix}\n${initialHint}\n${promptPrefix}` : promptPrefix;
    let responded = false;
    const done = (line: string | null): void => {
      if (responded) return;
      responded = true;
      rl.close();
      if (bufferRef) bufferRef.current = "";
      onLine(line?.trim() ?? null);
    };
    rl.on("close", () => done(null));
    rl.question(readlinePrompt, (line) => {
      done(line ?? null);
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

  /** Redraw prompt line; show "/ for commands" below when empty, or command list when line starts with "/". */
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
      process.stdout.write("\n" + text);
      lastSuggestionLinesRef.current = lines;
      process.stdout.write(BANNER_ANSI.up(getSlashSuggestionCursorUpLines(lines)));
      process.stdout.write("\r" + promptPrefix + buffer);
    } else if (buffer.length === 0) {
      const hint = getPromptPlaceholder(buffer, placeholderText);
      if (hint) {
        process.stdout.write("\n" + hint);
        lastSuggestionLinesRef.current = 1;
        process.stdout.write(BANNER_ANSI.up(1));
        process.stdout.write("\r" + promptPrefix);
      }
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
        process.stdout.write(BANNER_ANSI.down(1) + BANNER_ANSI.clearLineFull);
      }
      process.stdout.write(BANNER_ANSI.up(toClear));
    }
    process.stdout.write("\r" + BANNER_ANSI.clearLineFull + promptPrefix + (line ?? ""));
    process.stdout.write("\n");
    onLine(line);
  }

  function onData(key: string | Buffer): void {
    const k = typeof key === "string" ? key : key.toString("utf8");
    for (let i = 0; i < k.length; i++) {
      const c = k[i]!;
      if (escapeState === 1) {
        if (c === "d" && buffer.length === 0) {
          finish(null);
          return;
        }
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
        finish(null);
        return;
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
  const initialHint = getPromptPlaceholder("", placeholderText);
  if (initialHint) {
    process.stdout.write("\n" + initialHint);
    lastSuggestionLinesRef.current = 1;
    process.stdout.write(BANNER_ANSI.up(1));
    process.stdout.write("\r" + promptPrefix);
  }
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

const INIT_REQUIRED_MESSAGE =
  "Neotoma setup is required. Run 'neotoma init' to set repo path, or set NEOTOMA_REPO_ROOT.";

async function resolveRepoRootFromInitContext(): Promise<{
  config: Config;
  repoRoot: string | null;
}> {
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
  return { config, repoRoot };
}

async function persistRepoRootIfMissing(config: Config, repoRoot: string): Promise<void> {
  if (config.repo_root) return;
  await writeConfig({ ...config, repo_root: repoRoot });
  process.stderr.write(dim("Saved repo path to config: ") + pathStyle(CONFIG_PATH) + "\n");
}

async function resolveAndPersistRepoRootFromInitContext(): Promise<string | null> {
  const { config, repoRoot } = await resolveRepoRootFromInitContext();
  if (!repoRoot) return null;
  await persistRepoRootIfMissing(config, repoRoot);
  return repoRoot;
}

async function maybeRunInitForMissingRepo(promptEnabled: boolean): Promise<string | null> {
  let repoRoot = await resolveAndPersistRepoRootFromInitContext();
  if (repoRoot) return repoRoot;
  if (!promptEnabled) return null;

  const runInit = await askYesNo(
    "Neotoma is not initialized in this shell. Run " +
      pathStyle("neotoma init") +
      " now to set it up? (y/n) "
  );
  if (!runInit) return null;

  const child = spawn(process.argv[0], [process.argv[1], "init"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env },
  });
  const exitCode = await new Promise<number | null>((res) => child.on("close", res));
  if (exitCode !== 0) return null;
  repoRoot = await resolveAndPersistRepoRootFromInitContext();
  return repoRoot;
}

async function loadNpmScripts(): Promise<{ repoRoot: string; scripts: NpmScript[] }> {
  const repoRoot = await resolveAndPersistRepoRootFromInitContext();
  if (!repoRoot) {
    throw new Error(
      "Not a Neotoma repo. Run from the repo root (package.json name must be 'neotoma'), run 'neotoma init' to set repo path, or set NEOTOMA_REPO_ROOT."
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

/** Wrap a string to a max display width; returns lines. Prefers breaking at / or space so paths and words don't split mid-token. */
function wrapByDisplayWidth(str: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [str];
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    const next = current + ch;
    if (displayWidth(next) > maxWidth && current.length > 0) {
      const breakAt = Math.max(current.lastIndexOf("/"), current.lastIndexOf(" "));
      if (breakAt > 0 && displayWidth(current.slice(0, breakAt)) <= maxWidth) {
        lines.push(current.slice(0, breakAt).trimEnd());
        current = current.slice(breakAt) + ch;
      } else {
        lines.push(current);
        current = ch;
      }
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Preferred order for entity table; any other top-level keys are appended sorted. */
const ENTITY_DISPLAY_KEYS = [
  "entity_id",
  "entity_type",
  "canonical_name",
  "schema_version",
  "observation_count",
  "last_observation_at",
  "computed_at",
  "merged_to_entity_id",
  "merged_at",
] as const;

/**
 * Format one entity as a two-column table (name, value). Skips missing/undefined.
 * Shows ENTITY_DISPLAY_KEYS first, then all snapshot keys (sorted), then provenance,
 * raw_fragments, and any other top-level keys. Values wrap within the value column.
 */
function formatEntityPropertiesTable(entity: Record<string, unknown>): string {
  const seen = new Set<string>();
  const pairs: [string, unknown][] = [];
  const id = entity.entity_id ?? (entity as { id?: unknown }).id;
  if (id !== undefined && id !== null) {
    pairs.push(["entity_id", id]);
    seen.add("entity_id");
    if (entity.entity_id === undefined || entity.entity_id === null) seen.add("id");
  }
  for (const k of ENTITY_DISPLAY_KEYS) {
    if (k === "entity_id") continue;
    const v = entity[k];
    if (v !== undefined && v !== null) {
      pairs.push([k, v]);
      seen.add(k);
    }
  }
  const snapshot = entity.snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    seen.add("snapshot");
    const keys = Object.keys(snapshot as Record<string, unknown>).sort();
    for (const k of keys) {
      const v = (snapshot as Record<string, unknown>)[k];
      if (v !== undefined && v !== null) pairs.push([k, v]);
    }
  }
  for (const k of ["provenance", "raw_fragments"] as const) {
    const v = entity[k];
    if (v !== undefined && v !== null) {
      pairs.push([k, v]);
      seen.add(k);
    }
  }
  const rest = Object.keys(entity).filter((k) => !seen.has(k)).sort();
  for (const k of rest) {
    const v = entity[k];
    if (v !== undefined && v !== null) pairs.push([k, v]);
  }
  const nameColWidth = pairs.length
    ? Math.max(displayWidth("Field"), ...pairs.map(([k]) => displayWidth(k)))
    : displayWidth("Field");
  const gap = 2;
  const termWidth = typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const valueColWidth = Math.max(10, termWidth - nameColWidth - gap);
  const prefix = " ".repeat(nameColWidth + gap);
  const out: string[] = [];
  out.push(bold(padToDisplayWidth("Field", nameColWidth)) + "  " + bold("Value"));
  out.push(dim("-".repeat(nameColWidth) + "  " + "-".repeat(Math.min(valueColWidth, 40))));
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

/** Source field order for display. All other keys from the record are appended sorted. */
const SOURCE_DISPLAY_KEYS = [
  "id",
  "user_id",
  "mime_type",
  "original_filename",
  "file_size",
  "created_at",
  "storage_url",
  "content_hash",
  "source_type",
  "provenance",
  "idempotency_key",
] as const;

/**
 * Format one source as a two-column table (name, value). Uses same layout as entity table.
 * Shows SOURCE_DISPLAY_KEYS first, then any other keys from the record.
 */
function formatSourcePropertiesTable(source: Record<string, unknown>): string {
  const seen = new Set<string>();
  const pairs: [string, unknown][] = [];
  for (const k of SOURCE_DISPLAY_KEYS) {
    const v = source[k];
    if (v !== undefined && v !== null) {
      pairs.push([k, v]);
      seen.add(k);
    }
  }
  const rest = Object.keys(source)
    .filter((k) => !seen.has(k))
    .sort();
  for (const k of rest) {
    const v = source[k];
    if (v !== undefined && v !== null) pairs.push([k, v]);
  }
  const nameColWidth = pairs.length
    ? Math.max(displayWidth("Field"), ...pairs.map(([k]) => displayWidth(k)))
    : displayWidth("Field");
  const gap = 2;
  const termWidth = typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const valueColWidth = Math.max(10, termWidth - nameColWidth - gap);
  const prefix = " ".repeat(nameColWidth + gap);
  const out: string[] = [];
  out.push(bold(padToDisplayWidth("Field", nameColWidth)) + "  " + bold("Value"));
  out.push(dim("-".repeat(nameColWidth) + "  " + "-".repeat(Math.min(valueColWidth, 40))));
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

/** Relationship field order for display. All other keys from the record are appended sorted. */
const RELATIONSHIP_DISPLAY_KEYS = [
  "relationship_key",
  "relationship_type",
  "source_entity_id",
  "target_entity_id",
  "observation_count",
  "last_observation_at",
  "computed_at",
  "schema_version",
  "snapshot",
  "provenance",
  "user_id",
] as const;

/**
 * Format one relationship as a two-column table (name, value). Uses same layout as entity/source table.
 */
function formatRelationshipPropertiesTable(relationship: Record<string, unknown>): string {
  const seen = new Set<string>();
  const pairs: [string, unknown][] = [];
  for (const k of RELATIONSHIP_DISPLAY_KEYS) {
    const v = relationship[k];
    if (v !== undefined && v !== null) {
      pairs.push([k, v]);
      seen.add(k);
    }
  }
  const rest = Object.keys(relationship)
    .filter((k) => !seen.has(k))
    .sort();
  for (const k of rest) {
    const v = relationship[k];
    if (v !== undefined && v !== null) pairs.push([k, v]);
  }
  const nameColWidth = pairs.length
    ? Math.max(displayWidth("Field"), ...pairs.map(([k]) => displayWidth(k)))
    : displayWidth("Field");
  const gap = 2;
  const termWidth = typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  const valueColWidth = Math.max(10, termWidth - nameColWidth - gap);
  const prefix = " ".repeat(nameColWidth + gap);
  const out: string[] = [];
  out.push(bold(padToDisplayWidth("Field", nameColWidth)) + "  " + bold("Value"));
  out.push(dim("-".repeat(nameColWidth) + "  " + "-".repeat(Math.min(valueColWidth, 40))));
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

function writeTemporaryApiStatusMessage(message: string, mode: OutputMode): void {
  if (mode !== "pretty") {
    writeMessage(message, mode);
    return;
  }
  const lower = message.toLowerCase();
  const styled =
    lower.includes("not running")
      ? bullet(warn(message))
      : lower.includes("started")
        ? bullet(success(message))
        : lower.includes("stopped")
          ? bullet(dim(message))
          : bullet(dim(message));
  writeMessage(styled, mode);
}

function formatChoicePrompt(question: string): string {
  const trimmed = question.trimStart();
  if (trimmed.startsWith("?")) return question;
  const isMultiChoice =
    /\[[^\]]+\]/.test(question) ||
    /\((?:y\/n|yes\/no)\)/i.test(question) ||
    /\bdefault\s*:\s*[^)]+/i.test(question);
  return isMultiChoice ? `? ${question}` : question;
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
        "Server not reachable. API may still be starting. Check data/logs/session.log or session.prod.log. " +
        "Retry with `neotoma --env prod` if the server crashed."
      );
    }
    return "Server not reachable. Is the API running? Try `neotoma api start --env dev`. If the API is on port 8180 (e.g. npm run dev:prod), use --base-url http://localhost:8180 or --env prod";
  }
  if (code === "ENOTFOUND") {
    return "Host not found. Check --base-url or --env.";
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
  const authUrl = new URL(`${params.baseUrl}/mcp/oauth/authorize`);
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

  const response = await fetch(`${baseUrl}/mcp/oauth/token`, {
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
  let me: { user_id?: string; email?: string } | null = null;
  try {
    const res = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) me = (await res.json()) as { user_id?: string; email?: string };
  } catch {
    // Omit user details if /me fails
  }
  if (outputMode === "json") {
    writeOutput(
      {
        message: "Authentication successful.",
        user_id: me?.user_id ?? null,
        email: me?.email ?? null,
      },
      outputMode
    );
  } else {
    writeMessage("Authentication successful.", outputMode);
    if (me?.user_id) writeMessage("User ID: " + me.user_id, outputMode);
    if (me?.email) writeMessage("Email: " + me.email, outputMode);
  }
}

/**
 * Ensure we have an active session; if GET /me returns 401 and we're in a TTY, run OAuth login.
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
      const res = await fetch(`${baseUrl}/me`, {
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
 * Encryption off: NEOTOMA_BEARER_TOKEN env, then stored OAuth token from config, or no token (API treats no Bearer as dev-local).
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
  const config = await readConfig();
  if (config.access_token?.trim()) return config.access_token;
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
function _nestArt(): string {
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
const TUNNEL_PROD_URL_FILE = "/tmp/ngrok-mcp-prod-url.txt";

/** Tunnel URL, PID, and log paths under repo data/logs (consolidated with session and CLI logs). */
function getTunnelUrlFile(repoRoot: string, env: "dev" | "prod"): string {
  return path.join(
    repoRoot,
    "data",
    "logs",
    env === "dev" ? "tunnel-dev-url.txt" : "tunnel-prod-url.txt"
  );
}
function getTunnelPidFile(repoRoot: string, env: "dev" | "prod"): string {
  return path.join(repoRoot, "data", "logs", env === "dev" ? "tunnel-dev.pid" : "tunnel-prod.pid");
}
const TUNNEL_POLL_MS = 1200;
const TUNNEL_POLL_ATTEMPTS = 10;

/** Poll tunnel URL files; returns { dev, prod } with base URLs or null. Uses repo data/logs when repoRoot given, else /tmp fallback. */
async function readTunnelUrls(
  repoRoot?: string | null
): Promise<{ dev: string | null; prod: string | null }> {
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

/** Return command list text and line count (for live redraw). Lines are capped to terminal width so the block does not wrap and cursor-up math stays correct. */
function getSessionCommandsBlock(prog: Command, filter?: string): { text: string; lines: number } {
  const commands = getSessionCommands(prog, filter);
  const maxLineWidth = getTerminalWidth(2);
  if (commands.length === 0) {
    const msg = dim("No commands match. Type ") + pathStyle("/") + dim(" to see all.") + "\n\n";
    return { text: truncateToDisplayWidth(msg.trim(), maxLineWidth) + "\n\n", lines: 2 };
  }
  const getDisplayCommandName = (name: string): string => {
    if (name === "init") return "initialization";
    if (name === "config") return "configuration";
    return name;
  };
  const nameWidth = Math.max(...commands.map((c) => displayWidth(getDisplayCommandName(c.name))));
  const gap = "  ";
  const lineArr: string[] = [];
  lineArr.push("");
  for (const c of commands) {
    const line =
      padToDisplayWidth(pathStyle(getDisplayCommandName(c.name)), nameWidth) +
      gap +
      dim(c.description);
    lineArr.push(truncateToDisplayWidth(line, maxLineWidth));
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
  .option(
    "--offline",
    "Run data commands through in-process local transport (no running API process required)"
  )
  .option("--api-only", "Disable offline fallback; fail when API is unreachable")
  .option("--json", "Output machine-readable JSON")
  .option("--pretty", "Output formatted JSON for humans")
  .option("--no-session", "With no args: show intro then command menu (>); no servers")
  .option(
    "--no-servers",
    "With no args: use existing API only (no start). Same as --servers=use-existing."
  )
  .option("--servers <policy>", "Server policy: use-existing (connect only; fail if unreachable).")
  .option(
    "--env <env>",
    "Preferred environment for this run: development or production (overrides configuration when starting session)"
  )
  .option(
    "--tunnel",
    "Start HTTPS tunnel (ngrok/cloudflared) with development/production servers; off by default"
  )
  .option("--debug", "Show detailed initialization logs when starting session")
  .option(
    "--log-file <path>",
    "Append CLI stdout and stderr to this file (development default: repo data/logs/cli.<pid>.log when in a repo, else ~/.config/neotoma/cli.<pid>.log)"
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
program.hook("preAction", (_thisCommand, actionCommand) => {
  const opts = (actionCommand as Command).optsWithGlobals() as {
    offline?: boolean;
    apiOnly?: boolean;
  };
  if (opts.offline && opts.apiOnly) {
    throw new Error("Choose one: --offline or --api-only");
  }
  if (opts.offline) {
    process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT = "true";
    process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK = "false";
    return;
  }
  process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT = "false";
  if (opts.apiOnly) {
    process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK = "true";
  } else {
    delete process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK;
  }
});

// ── Session (interactive REPL) ─────────────────────────────────────────────

import { InitAbortError } from "./init_abort.js";

export { InitAbortError };

/** Ask a y/n question; returns true for y/yes, false otherwise. Rejects with InitAbortError on EOF (Cmd+D). */
function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let settled = false;
    rl.on("close", () => {
      if (!settled) {
        settled = true;
        reject(new InitAbortError());
      }
    });
    rl.question(formatChoicePrompt(question), (answer) => {
      if (!settled) {
        settled = true;
        rl.close();
        const a = (answer ?? "").trim().toLowerCase();
        resolve(a === "y" || a === "yes");
      }
    });
  });
}

/** Ask for a single line of input; returns trimmed string or empty. Rejects with InitAbortError on EOF (Cmd+D). */
function askQuestion(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let settled = false;
    rl.on("close", () => {
      if (!settled) {
        settled = true;
        reject(new InitAbortError());
      }
    });
    rl.question(formatChoicePrompt(question), (answer) => {
      if (!settled) {
        settled = true;
        rl.close();
        resolve((answer ?? "").trim());
      }
    });
  });
}

type InitAuthMode = "dev_local" | "oauth" | "key_derived" | "skip";

type InitAuthSummary = {
  mode: InitAuthMode;
  oauthCompleted: boolean;
  oauthDeferredReason?: string;
};

function normalizeInitAuthMode(input?: string): InitAuthMode | null {
  const normalized = (input || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "1" || normalized === "dev_local" || normalized === "dev-local") {
    return "dev_local";
  }
  if (
    normalized === "2" ||
    normalized === "3" ||
    normalized === "key_derived" ||
    normalized === "key-derived"
  ) {
    return "key_derived";
  }
  if (normalized === "oauth") {
    return "oauth";
  }
  if (normalized === "4" || normalized === "skip") {
    return "skip";
  }
  return null;
}

function initAuthModeLabel(mode: InitAuthMode): string {
  if (mode === "dev_local") return "Local (no login)";
  if (mode === "oauth") return "OAuth login";
  if (mode === "key_derived") return "Key-derived token";
  return "Skipped";
}

/** Detect auth mode from .env/config. Returns null if none configured. */
async function detectConfiguredAuthMode(
  envPath: string | null
): Promise<{ mode: InitAuthMode; source: string } | null> {
  if (envPath) {
    try {
      const raw = await fs.readFile(envPath, "utf-8");
      const lines = raw.split("\n");
      let encryptionEnabled = false;
      let keyFilePathSet = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (key === "NEOTOMA_ENCRYPTION_ENABLED") encryptionEnabled = val === "true";
        if (key === "NEOTOMA_KEY_FILE_PATH") keyFilePathSet = val.length > 0;
      }
      if (encryptionEnabled || keyFilePathSet) return { mode: "key_derived", source: envPath };
    } catch {
      // no .env or unreadable
    }
  }
  try {
    const config = await readConfig();
    if ((config.access_token ?? config.connection_id) != null) {
      return { mode: "oauth", source: CONFIG_PATH };
    }
    if (config.init_auth_mode === "dev_local") {
      return { mode: "dev_local", source: CONFIG_PATH };
    }
  } catch {
    // no config
  }
  return null;
}

function backupTimestamp(): string {
  // Compact local timestamp: 20260224-153012
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function movePathToTimestampBackup(srcPath: string, ts: string): Promise<string | null> {
  if (!(await pathExists(srcPath))) return null;
  let backupPath = `${srcPath}.backup.${ts}`;
  let suffix = 1;
  while (await pathExists(backupPath)) {
    backupPath = `${srcPath}.backup.${ts}.${suffix++}`;
  }
  try {
    await fs.rename(srcPath, backupPath);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "EXDEV") {
      await fs.cp(srcPath, backupPath, { recursive: true });
      await fs.rm(srcPath, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
  if (await pathExists(srcPath)) return null;
  return backupPath;
}

async function readEnvFileVars(envPath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(envPath, "utf-8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function resolvePathInput(inputPath: string, baseDir: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) return baseDir;
  const homeExpanded = trimmed.replace(/^~(?=\/|$)/, os.homedir());
  if (path.isAbsolute(homeExpanded)) return path.normalize(homeExpanded);
  return path.resolve(baseDir, homeExpanded);
}

async function normalizePathForContainmentCheck(inputPath: string): Promise<string> {
  try {
    return await fs.realpath(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

function isPathWithinDirectory(targetPath: string, directoryPath: string): boolean {
  const rel = path.relative(directoryPath, targetPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function quoteSqlIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, `""`)}"`;
}

function buildDbFamily(baseFileName: string): string[] {
  return [baseFileName, `${baseFileName}-wal`, `${baseFileName}-shm`];
}

const SQLITE_DB_BASE_FILES = ["neotoma.db", "neotoma.prod.db"] as const;

type DbMergeStats = {
  source_db: string;
  target_db: string;
  tables_scanned: number;
  rows_inserted: number;
  rows_ignored: number;
};

async function listExistingDbFiles(dataDir: string): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const baseName of SQLITE_DB_BASE_FILES) {
    for (const fileName of buildDbFamily(baseName)) {
      const filePath = path.join(dataDir, fileName);
      if (await pathExists(filePath)) existing.add(fileName);
    }
  }
  return existing;
}

async function copyDbFilesByName(
  fromDir: string,
  toDir: string,
  fileNames: Iterable<string>
): Promise<string[]> {
  const copied: string[] = [];
  for (const fileName of fileNames) {
    const sourcePath = path.join(fromDir, fileName);
    if (!(await pathExists(sourcePath))) continue;
    const targetPath = path.join(toDir, fileName);
    await fs.copyFile(sourcePath, targetPath);
    copied.push(targetPath);
  }
  return copied;
}

async function removeDbFilesByName(
  dataDir: string,
  fileNames: Iterable<string>
): Promise<string[]> {
  const removed: string[] = [];
  for (const fileName of fileNames) {
    const targetPath = path.join(dataDir, fileName);
    if (!(await pathExists(targetPath))) continue;
    await fs.rm(targetPath, { force: true });
    removed.push(targetPath);
  }
  return removed;
}

async function backupFilesWithTimestamp(filePaths: string[], ts: string): Promise<string[]> {
  const backups: string[] = [];
  for (const sourcePath of filePaths) {
    if (!(await pathExists(sourcePath))) continue;
    let backupPath = `${sourcePath}.backup.${ts}`;
    let suffix = 1;
    while (await pathExists(backupPath)) {
      backupPath = `${sourcePath}.backup.${ts}.${suffix++}`;
    }
    await fs.copyFile(sourcePath, backupPath);
    backups.push(backupPath);
  }
  return backups;
}

function checkpointWal(db: Database.Database): void {
  try {
    db.pragma("wal_checkpoint(FULL)");
  } catch {
    // Ignore checkpoint failures for non-WAL or read-only databases.
  }
}

function mergeSqliteDatabase(sourceDbPath: string, targetDbPath: string): DbMergeStats {
  let sourceDb: Database.Database | null = null;
  let targetDb: Database.Database | null = null;
  let attached = false;
  const stats: DbMergeStats = {
    source_db: sourceDbPath,
    target_db: targetDbPath,
    tables_scanned: 0,
    rows_inserted: 0,
    rows_ignored: 0,
  };
  try {
    sourceDb = new Database(sourceDbPath, { readonly: true });
    targetDb = new Database(targetDbPath);
    checkpointWal(sourceDb);
    checkpointWal(targetDb);
    targetDb.prepare("ATTACH DATABASE ? AS src").run(sourceDbPath);
    attached = true;

    const targetTables = targetDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const sourceTableSet = new Set(
      (
        targetDb
          .prepare(
            "SELECT name FROM src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name)
    );

    for (const table of targetTables) {
      const tableName = table.name;
      if (!sourceTableSet.has(tableName)) continue;

      const targetCols = (
        targetDb.prepare(`PRAGMA table_info(${quoteSqlIdent(tableName)})`).all() as Array<{
          name: string;
        }>
      ).map((row) => row.name);
      const sourceCols = new Set(
        (
          targetDb.prepare(`PRAGMA src.table_info(${quoteSqlIdent(tableName)})`).all() as Array<{
            name: string;
          }>
        ).map((row) => row.name)
      );
      const sharedCols = targetCols.filter((name) => sourceCols.has(name));
      if (sharedCols.length === 0) continue;

      const quotedCols = sharedCols.map((name) => quoteSqlIdent(name)).join(", ");
      const quotedTable = quoteSqlIdent(tableName);
      const sourceCountRow = targetDb
        .prepare(`SELECT COUNT(*) as count FROM src.${quotedTable}`)
        .get() as { count?: number };
      const sourceCount = Number(sourceCountRow?.count ?? 0);
      const insertResult = targetDb
        .prepare(
          `INSERT OR IGNORE INTO ${quotedTable} (${quotedCols}) SELECT ${quotedCols} FROM src.${quotedTable}`
        )
        .run();
      const inserted = Number(insertResult.changes ?? 0);
      const ignored = Math.max(0, sourceCount - inserted);

      stats.tables_scanned += 1;
      stats.rows_inserted += inserted;
      stats.rows_ignored += ignored;
    }
  } finally {
    if (targetDb) {
      try {
        if (attached) targetDb.prepare("DETACH DATABASE src").run();
      } catch {
        // ignore detach failures
      }
      targetDb.close();
    }
    if (sourceDb) sourceDb.close();
  }
  return stats;
}

async function updateOrInsertEnvVar(envPath: string, key: string, value: string): Promise<void> {
  const lineRegex = new RegExp(`^#?\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m");
  const cleanValue = value.replace(/\n/g, "");
  let envText = "";
  try {
    envText = await fs.readFile(envPath, "utf-8");
  } catch {
    envText = "";
  }
  if (lineRegex.test(envText)) {
    envText = envText.replace(lineRegex, `${key}=${cleanValue}`);
  } else {
    envText = envText.trimEnd();
    envText = envText.length > 0 ? `${envText}\n${key}=${cleanValue}\n` : `${key}=${cleanValue}\n`;
  }
  await fs.writeFile(envPath, envText);
}

function userLevelMcpConfigPaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;
  const out = [path.join(home, ".cursor", "mcp.json"), path.join(home, ".codex", "config.toml")];
  if (platform === "darwin") {
    out.push(
      path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    );
  } else if (platform === "linux") {
    out.push(path.join(home, ".config", "Claude", "claude_desktop_config.json"));
  } else if (platform === "win32" && process.env.APPDATA) {
    out.push(path.join(process.env.APPDATA, "Claude", "claude_desktop_config.json"));
  }
  if (platform === "darwin" || platform === "linux") {
    out.push(path.join(home, ".codeium", "windsurf", "mcp_config.json"));
  } else if (platform === "win32" && process.env.APPDATA) {
    out.push(path.join(process.env.APPDATA, "Codeium", "Windsurf", "mcp_config.json"));
  }
  return out;
}

async function removeNeotomaServersFromJsonMcpConfig(configPath: string): Promise<boolean> {
  let parsed: { mcpServers?: Record<string, unknown> };
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
  } catch {
    return false;
  }
  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") return false;
  const nextServers = { ...parsed.mcpServers };
  const neotomaServerIds = Object.keys(nextServers).filter((serverId) =>
    /^neotoma(?:[-_].*)?$/i.test(serverId.trim())
  );
  if (neotomaServerIds.length === 0) return false;
  for (const serverId of neotomaServerIds) {
    delete nextServers[serverId];
  }
  parsed.mcpServers = nextServers;
  await writeFileAtomic(configPath, JSON.stringify(parsed, null, 2) + "\n");
  return true;
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.neotoma-reset.${process.pid}`;
  await fs.writeFile(tmpPath, content);
  await fs.rename(tmpPath, filePath);
}

async function removeNeotomaCodexMarkerBlock(configPath: string): Promise<boolean> {
  if (!(await pathExists(configPath))) return false;
  let content: string;
  try {
    content = await fs.readFile(configPath, "utf-8");
  } catch {
    return false;
  }
  let next = content;
  const neotomaMarker = "# --- Neotoma MCP servers (do not edit by hand) ---";
  const neotomaMarkerEnd = "# --- end Neotoma MCP servers ---";
  if (next.includes(neotomaMarker)) {
    next = next.replace(new RegExp(neotomaMarker + "[\\s\\S]*?" + neotomaMarkerEnd, "gm"), "");
  }
  const syncMarker = "# --- MCP servers synced from .cursor/mcp.json (do not edit by hand) ---";
  const syncMarkerEnd = "# --- end synced MCP servers ---";
  const syncBlockRegex = new RegExp(syncMarker + "[\\s\\S]*?" + syncMarkerEnd, "gm");
  next = next.replace(syncBlockRegex, (block) => {
    if (/\[mcp_servers\.neotoma(?:[-_.][^\]]+)?\]/i.test(block)) {
      return "";
    }
    return block;
  });
  // Also strip any remaining neotoma* sections written outside marker blocks.
  const lines = next.split("\n");
  const kept: string[] = [];
  let dropping = false;
  const isSectionHeader = (line: string): boolean => /^\s*\[[^\]]+\]\s*$/.test(line);
  const isNeotomaMcpSectionHeader = (line: string): boolean =>
    /^\s*\[mcp_servers\.neotoma(?:[-_.][^\]]+)?\]\s*$/i.test(line);
  for (const line of lines) {
    if (isSectionHeader(line)) {
      if (isNeotomaMcpSectionHeader(line)) {
        dropping = true;
        continue;
      }
      dropping = false;
    }
    if (!dropping) kept.push(line);
  }
  next = kept.join("\n");
  next = next.replace(/\n{3,}/g, "\n\n").trimEnd();
  if (next && !next.endsWith("\n")) next += "\n";
  if (next === content) return false;
  await writeFileAtomic(configPath, next);
  return true;
}

function parsePortFromBaseUrl(baseUrl: string): number {
  const parsed = new URL(baseUrl);
  if (parsed.port) return parseInt(parsed.port, 10);
  return parsed.protocol === "https:" ? 443 : 80;
}

function isLocalHost(baseUrl: string): boolean {
  const parsed = new URL(baseUrl);
  return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
}

async function isApiReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { ok?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
}

async function startTemporaryApiForInit(params: {
  repoRoot: string;
  baseUrl: string;
  outputMode: OutputMode;
  /** Message after API is ready (default: " for OAuth setup.") */
  startedMessage?: string;
}): Promise<{ child: ReturnType<typeof spawn>; logPath: string }> {
  const port = parsePortFromBaseUrl(params.baseUrl);
  const actionsPath = path.join(params.repoRoot, "dist", "actions.js");
  try {
    await fs.access(actionsPath);
  } catch {
    throw new Error(
      "Could not start temporary API because dist/actions.js was not found. Build first with `npm run build:server`."
    );
  }

  const logsDir = path.join(params.repoRoot, "data", "logs");
  await fs.mkdir(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `init-api.${Date.now()}.log`);
  const logStream = createWriteStream(logPath, { flags: "a" });
  const envName = port === 8180 ? "production" : "development";
  const child = spawn(process.execPath, [actionsPath], {
    cwd: params.repoRoot,
    env: {
      ...process.env,
      HTTP_PORT: String(port),
      NEOTOMA_ENV: envName,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  const onExit = new Promise<never>((_, reject) => {
    child.once("exit", (code) => {
      reject(
        new Error(
          `Temporary API exited before becoming ready (code ${code ?? "unknown"}). Check logs: ${logPath}`
        )
      );
    });
  });

  const onReady = (async () => {
    const healthy = await waitForHealth(port, { timeoutMs: 45000, intervalMs: 800 });
    if (!healthy) {
      throw new Error(`Temporary API did not become healthy in time. Check logs: ${logPath}`);
    }
    const ready = await waitForApiReady(port, { timeoutMs: 20000, intervalMs: 500 });
    if (!ready) {
      throw new Error(`Temporary API did not become request-ready in time. Check logs: ${logPath}`);
    }
  })();

  await Promise.race([onExit, onReady]);
  writeTemporaryApiStatusMessage(
    "Temporary API started" + (params.startedMessage ?? " for OAuth setup."),
    params.outputMode
  );
  return { child, logPath };
}

async function stopTemporaryApiForInit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.killed || child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!child.killed && child.exitCode == null) child.kill("SIGKILL");
        resolve();
      }, 3000);
    }),
  ]);
}

/** Server policy: start (spawn API if needed) or use-existing (connect only). */
type ServerPolicy = "start" | "use-existing";

/** Resolve server policy. Interactive startup always uses existing servers. */
async function resolveServerPolicy(
  noServers: boolean,
  serversOpt: string | undefined
): Promise<ServerPolicy> {
  void noServers;
  void serversOpt;
  return "use-existing";
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
  /** Environment when events are merged from multiple envs (e.g. watch --env all). */
  env?: "dev" | "prod";
  /** Optional IDs from the row for "view details": entity get, sources get, relationship get/list. */
  entity_id?: string;
  relationship_key?: string;
  relationship_type?: string;
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

const WATCH_TABLE_ENV_WIDTH = 4;

/** Format watch events as a table (# | Env | Time | Type | Action | ID | Summary). Returns lines including header and separator. Row numbers 1..N allow "view details" by entering the number at the prompt. Env column always shown (dev/prod or "-"). */
function formatWatchTable(events: WatchEvent[], ref: Date): string[] {
  if (events.length === 0) return [];
  const {
    num: wNum,
    time: wTime,
    type: wType,
    action: wAction,
    id: wId,
    summary: wSummary,
  } = WATCH_TABLE_COLUMNS;
  const header =
    bold(padToDisplayWidth("#", wNum)) +
    WATCH_TABLE_GAP +
    bold(padToDisplayWidth("Env", WATCH_TABLE_ENV_WIDTH)) +
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
    dim("-".repeat(WATCH_TABLE_ENV_WIDTH)) +
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
    const envStr = e.env ?? "-";
    const ago = truncateToDisplayWidth(timeAgo(e.ts, ref), wTime);
    const typeStr = e.entityType ?? "-";
    const typeShort = truncateToDisplayWidth(typeStr, wType);
    const actionShort = truncateToDisplayWidth(e.actionLabel, wAction);
    const idShort = truncateToDisplayWidth(e.id, wId);
    const summaryShort = truncateToDisplayWidth(e.summary, wSummary);
    return (
      dim(padToDisplayWidth(numStr, wNum)) +
      WATCH_TABLE_GAP +
      dim(padToDisplayWidth(envStr, WATCH_TABLE_ENV_WIDTH)) +
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
  const dataDir = resolveDataDir(repoRoot);
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
      const res = await fetch(`http://127.0.0.1:${sessionPort}/me`, {
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
    if (table === "observations")
      return str("entity_type") || entityTypes.get(str("entity_id")) || "-";
    if (table === "entity_snapshots")
      return str("entity_type") || entityTypes.get(str("entity_id")) || "-";
    if (table === "raw_fragments") return str("entity_type") || "-";
    if (table === "timeline_events") return str("event_type") || "event";
    if (table === "relationship_observations" || table === "relationship_snapshots")
      return str("relationship_type") || "relationship";
    if (table === "entity_merges")
      return (
        entityTypes.get(str("from_entity_id")) || entityTypes.get(str("to_entity_id")) || "merge"
      );
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
  /** Last "view details" output (entity/source/relationship); re-printed on SIGWINCH so it survives resize. */
  lastDetailOutputRef?: { current: string | null };
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
  let hasSessionOutput = false;
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
      const toClear = suggestionLinesRef.current;
      if (toClear > 0) {
        for (let i = 0; i < toClear; i++) {
          process.stdout.write(BANNER_ANSI.down(1) + BANNER_ANSI.clearLineFull);
        }
        process.stdout.write(BANNER_ANSI.up(toClear));
      }
      suggestionLinesRef.current = 0;
      const line = _formatWatchLiveLine(event, new Date());
      process.stdout.write(
        "\r" +
          BANNER_ANSI.clearLineFull +
          "\n" +
          line +
          "\n" +
          bold("neotoma> ") +
          lineBufferRef.current
      );
      if (lineBufferRef.current.length === 0) {
        const hint = getPromptPlaceholder("", "/ for commands");
        if (hint) {
          process.stdout.write("\n" + hint);
          suggestionLinesRef.current = 1;
          process.stdout.write(BANNER_ANSI.up(1));
          process.stdout.write("\r" + bold("neotoma> "));
        }
      }
    };
    sessionWatchState = state;
  }

  let readyPhraseShown = false;
  const prompt = () => {
    suggestionLinesRef.current = 0;
    historyIndexRef.current = sessionHistory.length;
    if (!readyPhraseShown) {
      const phrase =
        SESSION_READY_PHRASES[sessionReadyPhraseIndex++ % SESSION_READY_PHRASES.length];
      lastReadyPhraseRef.current = phrase;
      process.stdout.write(success("●") + " " + dim(phrase) + "\n");
      readyPhraseShown = true;
    }
    askWithLiveSlash(
      program,
      bold("neotoma> "),
      onLine,
      lineBufferRef,
      suggestionLinesRef,
      historyRef
    );
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
        // Once command/history output exists, avoid injecting status blocks on resize.
        // This keeps previously shown prompts/details stable while still refreshing the prompt.
        process.stdout.write("\r" + BANNER_ANSI.clearLineFull);
        if (!hasSessionOutput) {
          process.stdout.write("\n");
          opts.redrawStatusBlock?.(lineBufferRef.current);
          process.stdout.write("\n");
        }
        process.stdout.write(bold("neotoma> ") + lineBufferRef.current);
        if (lineBufferRef.current.length === 0) {
          const hint = getPromptPlaceholder("", "/ for commands");
          if (hint) {
            process.stdout.write("\n" + hint);
            suggestionLinesRef.current = 1;
            process.stdout.write(BANNER_ANSI.up(1));
            process.stdout.write("\r" + bold("neotoma> "));
          }
        }
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
    hasSessionOutput = true;
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
    const rowNum = parseWatchRowSelection(trimmed);
    if (trimmed.startsWith("/") && rowNum === 0) {
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
          dim(
            "  Enter a row number between 1 and " +
              lastShownWatchEvents.length +
              " to view details."
          ) + "\n"
        );
        prompt();
        return;
      }
    }
    if (rowNum >= 1 && lastShownWatchEvents && rowNum <= lastShownWatchEvents.length) {
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
          event.table === "raw_fragments") &&
        event.entity_id
      ) {
        argv = [process.argv[0], process.argv[1], "entities", "get", event.entity_id];
      } else if (
        event.table === "relationship_observations" ||
        event.table === "relationship_snapshots"
      ) {
        const relationshipId =
          event.relationship_key ??
          (event.table === "relationship_snapshots" ? event.id : undefined) ??
          (event.relationship_type && event.source_entity_id && event.target_entity_id
            ? `${event.relationship_type}:${event.source_entity_id}:${event.target_entity_id}`
            : undefined);
        if (relationshipId) {
          argv = [
            process.argv[0],
            process.argv[1],
            "relationships",
            "get",
            "--relationship-id",
            relationshipId,
          ];
        } else if (event.source_entity_id) {
          argv = [
            process.argv[0],
            process.argv[1],
            "relationships",
            "list",
            "--source-entity-id",
            event.source_entity_id,
          ];
        }
      } else if (event.table === "entity_merges" && event.to_entity_id) {
        argv = [process.argv[0], process.argv[1], "entities", "get", event.to_entity_id];
      } else if (event.table === "interpretations" && event.source_id) {
        argv = [process.argv[0], process.argv[1], "sources", "get", event.source_id];
      }
      if (argv !== null) {
        const localFallbackEnv: "dev" | "prod" | undefined =
          event.env === "dev" || event.env === "prod" ? event.env : opts?.preferredEnv;
        const entityIdForFallback =
          event.table === "entities" ? event.id : (event.entity_id ?? event.to_entity_id);
        const sourceIdForFallback =
          event.table === "sources"
            ? event.id
            : event.table === "interpretations"
              ? event.source_id
              : undefined;
        const relationshipIdForFallback =
          event.relationship_key ??
          (event.table === "relationship_snapshots" ? event.id : undefined) ??
          (event.relationship_type && event.source_entity_id && event.target_entity_id
            ? `${event.relationship_type}:${event.source_entity_id}:${event.target_entity_id}`
            : undefined);
        const isEntityGet =
          argv[2] === "entities" && argv[3] === "get" && typeof entityIdForFallback === "string";
        const isSourceGet =
          argv[2] === "sources" && argv[3] === "get" && typeof sourceIdForFallback === "string";
        const isRelationshipGet =
          argv[2] === "relationships" &&
          argv[3] === "get" &&
          typeof relationshipIdForFallback === "string";
        process.stdout.write("\n");
        let captureBuffer = "";
        const originalStdoutWrite = process.stdout.write.bind(process.stdout);
        const capturingWrite = (chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
          if (typeof chunk === "string") captureBuffer += chunk;
          else if (Buffer.isBuffer(chunk)) captureBuffer += chunk.toString();
          else if (
            chunk != null &&
            typeof (chunk as { toString?: () => string }).toString === "function"
          )
            captureBuffer += (chunk as { toString: () => string }).toString();
          return originalStdoutWrite(chunk as never, encoding as never, cb as never) as boolean;
        };
        (process.stdout as NodeJS.WriteStream).write = capturingWrite as NodeJS.WriteStream["write"];
        try {
          await program.parseAsync(argv);
        } catch (err) {
          if (err instanceof SessionExit) {
            process.exitCode = err.code;
          } else {
            const errMsg = err instanceof Error ? err.message : String(err);
            const is404EntityNotFound =
              isEntityGet && (errMsg.includes("404") || errMsg.includes("Entity not found"));
            const is404SourceNotFound =
              isSourceGet && (errMsg.includes("404") || errMsg.includes("Source not found"));
            if (
              is404EntityNotFound &&
              opts?.repoRoot &&
              localFallbackEnv &&
              opts?.userId &&
              entityIdForFallback
            ) {
              const localEntity = await getEntityFromLocalDb(
                opts.repoRoot,
                localFallbackEnv,
                opts.userId,
                entityIdForFallback
              );
              if (localEntity) {
                process.stdout.write(
                  formatEntityPropertiesTable(localEntity as Record<string, unknown>) + "\n"
                );
              } else {
                writeCliError(err);
                process.stdout.write(
                  dim(
                    "  Recent events are from local DB. If the API uses a different backend, the entity may exist only locally.\n"
                  )
                );
                process.exitCode = 1;
              }
            } else if (
              is404SourceNotFound &&
              opts?.repoRoot &&
              localFallbackEnv &&
              opts?.userId &&
              sourceIdForFallback
            ) {
              const localSource = await getSourceFromLocalDb(
                opts.repoRoot,
                localFallbackEnv,
                opts.userId,
                sourceIdForFallback
              );
              if (localSource) {
                process.stdout.write(
                  formatSourcePropertiesTable(localSource as Record<string, unknown>) + "\n"
                );
              } else {
                writeCliError(err);
                process.stdout.write(
                  dim(
                    "  Recent events are from local DB. If the API uses a different backend, the source may exist only locally.\n"
                  )
                );
                process.exitCode = 1;
              }
            } else if (
              isRelationshipGet &&
              opts?.repoRoot &&
              localFallbackEnv &&
              opts?.userId &&
              relationshipIdForFallback
            ) {
              const localRelationship = await getRelationshipFromLocalDb(
                opts.repoRoot,
                localFallbackEnv,
                opts.userId,
                relationshipIdForFallback
              );
              if (localRelationship) {
                process.stdout.write(
                  formatRelationshipPropertiesTable(localRelationship as Record<string, unknown>) +
                    "\n"
                );
              } else {
                writeCliError(err);
                process.stdout.write(
                  dim(
                    "  Recent events are from local DB. If the API uses a different backend (or env), the relationship may exist only locally.\n"
                  )
                );
                process.exitCode = 1;
              }
            } else {
              writeCliError(err);
              process.exitCode = 1;
            }
          }
        } finally {
          (process.stdout as NodeJS.WriteStream).write = originalStdoutWrite;
          if (opts?.lastDetailOutputRef && captureBuffer.length > 0)
            opts.lastDetailOutputRef.current = captureBuffer;
        }
        prompt();
        return;
      }
      process.stdout.write(
        dim(
          "  ID: " + event.id + " — run neotoma " + event.table.replace(/_/g, " ") + " for list."
        ) + "\n"
      );
      prompt();
      return;
    }

    const args = parseSessionLine(trimmed);
    if (opts?.lastDetailOutputRef) opts.lastDetailOutputRef.current = null;
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
    const activePortStr = process.env.NEOTOMA_SESSION_API_PORT;
    const portEnvVar =
      preferredEnv === "dev" ? "NEOTOMA_SESSION_DEV_PORT" : "NEOTOMA_SESSION_PROD_PORT";
    const portStr = activePortStr ?? process.env[portEnvVar];

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
    "Initialize Neotoma for first-time use (create directories, database; prompts for encryption when desired)"
  )
  .option("--data-dir <path>", "Data directory path (default: ./data or ~/neotoma/data)")
  .option("--force", "Overwrite existing configuration")
  .option("--skip-db", "Skip database initialization")
  .option("--skip-env", "Skip interactive .env creation and variable prompts")
  .option("-y, --yes", "Apply the default init plan without prompts")
  .option("--advanced", "Use step-by-step interactive setup prompts")
  .option(
    "--auth-mode <mode>",
    "Auth setup mode: dev_local, oauth, or key_derived (non-interactive shortcut)"
  )
  .action(
    async (opts: {
      dataDir?: string;
      force?: boolean;
      skipDb?: boolean;
      skipEnv?: boolean;
      yes?: boolean;
      advanced?: boolean;
      authMode?: string;
    }) => {
      try {
        const outputMode = resolveOutputMode();
        let useAdvancedPrompts = Boolean(opts.advanced);
        /** Temporary API started at start of init (TTY), stopped at end of init */
        let temporaryApiForInit: { child: ReturnType<typeof spawn>; logPath: string } | null = null;

        // Resolve repo root consistently (config -> NEOTOMA_REPO_ROOT -> cwd), then persist when missing.
        const { config: initConfig, repoRoot: initialRepoRoot } =
          await resolveRepoRootFromInitContext();
        let repoRoot: string | null = initialRepoRoot;
        if (repoRoot) {
          await persistRepoRootIfMissing(initConfig, repoRoot);
        }
        let envRepoRoot: string | null = repoRoot;

        // Determine data directory (allow interactive override when --data-dir is not provided)
        const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
        const defaultDataDir = repoRoot
          ? path.join(repoRoot, "data")
          : path.join(homeDir, "neotoma", "data");
        let dataDir = opts.dataDir?.trim() || defaultDataDir;
        if (process.stdout.isTTY && useAdvancedPrompts) {
          const rawDataDir = await askQuestion(
            "Data directory [default: " + pathStyle(defaultDataDir) + "]: "
          );
          const trimmedDataDir = rawDataDir.trim().replace(/^~(?=\/|$)/, process.env.HOME || "");
          if (trimmedDataDir) {
            dataDir = path.isAbsolute(trimmedDataDir)
              ? trimmedDataDir
              : path.resolve(repoRoot ?? process.cwd(), trimmedDataDir);
            process.stdout.write(
              bullet(success("Using data directory: ") + pathStyle(dataDir)) + "\n" + nl()
            );
          }
        }

        const steps: {
          name: string;
          status: "done" | "skipped" | "created" | "exists";
          path?: string;
        }[] = [];

        // Data directory and dir/DB creation run after plan when interactive (so "p=personalize" can prompt for data dir)

        // 1. Encryption key: created later via prompt when user chooses key_derived auth
        let keyPath: string | undefined;
        let keyPathWrittenToEnv = false;

        // 4. .env in repo: use envRepoRoot (cwd repo, saved config, or path prompted below when not in repo)
        let envExamplePath: string | null = envRepoRoot
          ? path.join(envRepoRoot, ".env.example")
          : null;
        let envPath: string | null = envRepoRoot ? path.join(envRepoRoot, ".env") : null;
        const mcpTokenEncryptionKey = randomBytes(32).toString("hex");
        let envContent = ""; // built after plan with final dataDir

        // When not in a repo, optionally prompt for repo path so we can create .env there
        if (!envRepoRoot && process.stdout.isTTY && !opts.skipEnv && useAdvancedPrompts) {
          process.stdout.write(nl() + bullet(heading("Neotoma repo path")) + nl());
          const raw = await askQuestion("Repo path [default: skip]: ");
          const trimmed = raw.trim().replace(/^~(?=\/|$)/, process.env.HOME || "");
          if (trimmed) {
            const validated = await validateNeotomaRepo(trimmed);
            if (validated) {
              envRepoRoot = validated;
              repoRoot = validated;
              await persistRepoRootIfMissing(initConfig, envRepoRoot);
              envExamplePath = path.join(envRepoRoot, ".env.example");
              envPath = path.join(envRepoRoot, ".env");
              process.stdout.write(bullet(success("Using repo: ") + pathStyle(envRepoRoot)) + "\n");
            } else {
              process.stdout.write(
                bullet(
                  warn(
                    "Not a valid Neotoma repo (package.json name must be 'neotoma'). Skipping .env setup."
                  )
                ) + "\n"
              );
            }
          }
          process.stdout.write(nl());
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
          mcpScan = await scanForMcpConfigs(repoRoot ?? process.cwd(), {
            includeUserLevel: true,
            userLevelFirst: false,
            neotomaRepoRoot: repoRoot ?? null,
          });
        } catch {
          // Non-fatal; init succeeds without MCP scan
        }
        const mcpMissingAny =
          mcpScan.configs.some((c) => !c.hasDev || !c.hasProd) || mcpScan.configs.length === 0;
        const mcpMissingProd =
          mcpScan.configs.length === 0 || mcpScan.configs.some((c) => !c.hasProd);
        const authModeFromFlag = normalizeInitAuthMode(opts.authMode);
        if (opts.authMode && (!authModeFromFlag || authModeFromFlag === "skip")) {
          throw new Error("Invalid --auth-mode. Use dev_local, oauth, or key_derived.");
        }
        const defaultInitAuthMode: InitAuthMode = "dev_local";
        const initAuthSummary: InitAuthSummary = {
          mode: authModeFromFlag ?? defaultInitAuthMode,
          oauthCompleted: false,
        };
        if (outputMode === "pretty" && process.stdout.isTTY && !opts.yes && !useAdvancedPrompts) {
          const configuredAuth = await detectConfiguredAuthMode(envPath);
          const envExists = envPath ? await pathExists(envPath) : false;
          const plannedAuthMode = authModeFromFlag ?? configuredAuth?.mode ?? defaultInitAuthMode;
          const mcpUserPathsForPlan = userLevelMcpConfigPaths().filter(
            (p) =>
              p.includes(`${path.sep}.cursor${path.sep}`) ||
              p.toLowerCase().includes("claude") ||
              p.includes(`${path.sep}.codex${path.sep}`)
          );
          let cliRulePathsForPlan: string[] = [];
          try {
            const { getUserAppliedRulePaths } = await import("./agent_instructions_scan.js");
            const userRulePaths = getUserAppliedRulePaths();
            if (userRulePaths) {
              cliRulePathsForPlan = [userRulePaths.cursor, userRulePaths.claude, userRulePaths.codex];
            }
          } catch {
            // Non-fatal; path list is optional in plan view.
          }
          const envHandlingSummary = opts.skipEnv
            ? "Skipped"
            : envPath == null
              ? "Skipped"
              : "Defaults";
          const planRows: {
            label: string;
            value: string | string[];
            details?: string[];
          }[] = [
            {
              label: "Authentication",
              value: initAuthModeLabel(plannedAuthMode),
              details: [
                plannedAuthMode === "dev_local"
                  ? "Use local API access without login for development."
                  : plannedAuthMode === "oauth"
                    ? "Open browser authentication and complete sign-in setup."
                    : plannedAuthMode === "key_derived"
                      ? "Create or choose an encryption key for key-derived access."
                      : "Keep current authentication settings.",
              ],
            },
            {
              label: "Data directory",
              value: dataDir,
              details: [
                "Create data, sources, and logs at this location.",
                "Initialize local development and production SQLite databases with WAL mode.",
              ],
            },
            {
              label: "Environment",
              value: envPath && !opts.skipEnv ? envPath : envHandlingSummary,
              details:
                envPath && !opts.skipEnv
                  ? [
                      envExists
                        ? "Update local environment file by filling in missing defaults."
                        : "Create local environment file with detected defaults.",
                      "Leave OpenAI key unset unless you provide it.",
                    ]
                  : undefined,
            },
            {
              label: "MCP configuration",
              value:
                mcpMissingProd && mcpScan.repoRoot && mcpUserPathsForPlan.length > 0
                  ? mcpUserPathsForPlan
                  : mcpMissingProd && mcpScan.repoRoot
                    ? "User-wide production usage"
                    : "No changes",
              details:
                mcpMissingProd && mcpScan.repoRoot
                  ? [
                      "Add or update user-level Neotoma production server entries for Cursor, Claude, and Codex.",
                      "Keep project-level MCP configurations unchanged.",
                    ]
                  : mcpScan.repoRoot
                    ? ["Keep existing production MCP server configuration."]
                    : undefined,
            },
            {
              label: "CLI instructions",
              value:
                mcpScan.repoRoot && cliRulePathsForPlan.length > 0
                  ? cliRulePathsForPlan
                  : mcpScan.repoRoot
                    ? [
                        "~/.cursor/rules/neotoma_cli.mdc",
                        "~/.claude/rules/neotoma_cli.mdc",
                        "~/.codex/neotoma_cli.md",
                      ]
                    : "Skipped",
              details: mcpScan.repoRoot
                ? [
                    "Write or refresh local CLI instruction rules for Cursor, Claude, and Codex.",
                    "Prefer MCP access when available and use CLI as fallback.",
                  ]
                : undefined,
            },
          ];
          const labelWidth = Math.max(...planRows.map((r) => displayWidth(r.label)));
          const termWidth = getTerminalWidth(0);
          const gap = 2;
          // Cap value width so full line fits inside blackBox (box truncates with "…" otherwise)
          const boxPad = 1;
          const marginForBox = 2 + 2 * boxPad;
          const maxBoxContentWidth = Math.max(
            1,
            Math.min(termWidth, getTerminalWidth(marginForBox)) - boxPad
          );
          const valueWidth = Math.min(
            Math.max(20, termWidth - labelWidth - gap - 2),
            maxBoxContentWidth - labelWidth - gap
          );
          const tableLines: string[] = [bold("Step") + " ".repeat(Math.max(0, labelWidth - 4)) + "  " + bold("Details")];
          tableLines.push(dim("─".repeat(labelWidth) + "  " + "─".repeat(Math.min(valueWidth, 50))));
          for (const row of planRows) {
            const valueLines = Array.isArray(row.value) ? row.value : [row.value];
            const indent = " ".repeat(labelWidth + gap);
            let firstValueLine = true;
            for (const val of valueLines) {
              const wrapped = wrapByDisplayWidth(val, valueWidth);
              for (let j = 0; j < wrapped.length; j++) {
                const pad =
                  firstValueLine && j === 0
                    ? padToDisplayWidth(row.label, labelWidth)
                    : " ".repeat(labelWidth);
                tableLines.push(pad + "  " + bold(wrapped[j]!));
              }
              firstValueLine = false;
            }
            if (row.details) {
              for (const detail of row.details) {
                const wrapped = wrapByDisplayWidth(detail, valueWidth);
                for (const line of wrapped) {
                  tableLines.push(indent + dim(line));
                }
              }
            }
            tableLines.push("");
          }
          process.stdout.write(
            nl() +
              blackBox(tableLines, {
                title: " Initialization plan — defaults ",
                borderColor: "cyan",
                padding: 1,
                sessionBoxWidth: getTerminalWidth(),
              }) +
              nl() +
              nl()
          );
          const decision = (
            await askQuestion("Apply plan? [Enter=apply, p=personalize, q=quit]: ")
          )
            .trim()
            .toLowerCase();
          if (
            decision === "q" ||
            decision === "quit" ||
            decision === "c" ||
            decision === "cancel"
          ) {
            throw new InitAbortError();
          }
          if (decision === "p" || decision === "personalize") {
            useAdvancedPrompts = true;
            process.stdout.write(dim("Switching to advanced interactive prompts.") + nl() + nl());
            const rawDataDir = await askQuestion(
              "Data directory [default: " + pathStyle(dataDir) + "]: "
            );
            const trimmedDataDir = rawDataDir.trim().replace(/^~(?=\/|$)/, process.env.HOME || "");
            if (trimmedDataDir) {
              dataDir = path.isAbsolute(trimmedDataDir)
                ? trimmedDataDir
                : path.resolve(repoRoot ?? process.cwd(), trimmedDataDir);
              process.stdout.write(
                bullet(success("Using data directory: ") + pathStyle(dataDir)) + "\n" + nl()
              );
            }
          }
        }

        // Create data directories and DBs (and build envContent) now that final dataDir is set
        envContent = `# Neotoma Environment Configuration
# Repo path is stored in ~/.config/neotoma by neotoma init (or set NEOTOMA_REPO_ROOT at runtime to override).

# Data directory (defaults to ./data)
NEOTOMA_DATA_DIR=${dataDir}

# Set at runtime when needed: NEOTOMA_ENV (development|production), NEOTOMA_HTTP_PORT or HTTP_PORT

# MCP OAuth local login: encrypts tokens (set by init)
NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY=${mcpTokenEncryptionKey}

# Encryption (optional - for privacy-first mode)
# NEOTOMA_ENCRYPTION_ENABLED=true
# NEOTOMA_KEY_FILE_PATH=${keyPath || "~/.config/neotoma/keys/neotoma.key"}

# OpenAI API key (for LLM-based extraction)
# OPENAI_API_KEY=sk-...
`;
        const dirs = [dataDir, path.join(dataDir, "sources"), path.join(dataDir, "logs")];
        for (const dir of dirs) {
          try {
            await fs.access(dir);
            steps.push({ name: path.basename(dir) || "data", status: "exists", path: dir });
          } catch {
            await fs.mkdir(dir, { recursive: true });
            steps.push({ name: path.basename(dir) || "data", status: "created", path: dir });
          }
        }
        const dbFiles = ["neotoma.db", "neotoma.prod.db"] as const;
        if (!opts.skipDb) {
          const { default: Database } = await import("better-sqlite3");
          for (const dbFile of dbFiles) {
            const dbPath = path.join(dataDir, dbFile);
            try {
              await fs.access(dbPath);
              if (opts.force) {
                const db = new Database(dbPath);
                db.pragma("journal_mode = WAL");
                db.close();
                steps.push({ name: dbFile, status: "done", path: dbPath });
              } else {
                steps.push({ name: dbFile, status: "exists", path: dbPath });
              }
            } catch {
              const db = new Database(dbPath);
              db.pragma("journal_mode = WAL");
              db.close();
              steps.push({ name: dbFile, status: "created", path: dbPath });
            }
          }
        } else {
          steps.push({ name: "database", status: "skipped" });
        }
        if (envExamplePath) {
          try {
            await fs.access(envExamplePath);
            steps.push({ name: ".env.example", status: "exists", path: envExamplePath });
          } catch {
            steps.push({ name: ".env.example", status: "skipped", path: envExamplePath });
          }
        } else {
          steps.push({ name: ".env.example", status: "skipped" });
        }

        // Output results
        if (outputMode === "json") {
          const nextSteps = [
            "Copy .env.example to .env and configure",
            "Start the API: neotoma api start --env dev",
            "Configure MCP configuration: neotoma mcp config",
            "Run neotoma cli-instructions check to add the rule to Cursor, Claude, and Codex",
          ];
          if (mcpMissingAny) {
            nextSteps.push(
              "Run neotoma mcp check to add production server (or development+production) to MCP configurations"
            );
          }
          if (initAuthSummary.mode === "oauth") {
            nextSteps.push(
              "OAuth setup skipped in --json mode. Start the API, then run neotoma auth login (browser key-auth preflight required)."
            );
          } else if (initAuthSummary.mode === "key_derived") {
            nextSteps.push(
              "Enable key-derived auth: set NEOTOMA_ENCRYPTION_ENABLED=true and NEOTOMA_KEY_FILE_PATH in .env."
            );
          } else if (initAuthSummary.mode === "dev_local") {
            nextSteps.push(
              "Using local mode (no login). For remote MCP, run neotoma auth login (key-auth preflight) or configure NEOTOMA_BEARER_TOKEN."
            );
          }
          writeOutput(
            {
              success: true,
              data_dir: dataDir,
              steps,
              auth_setup: {
                mode: initAuthSummary.mode,
                oauth_completed: initAuthSummary.oauthCompleted,
              },
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

        if (process.stdout.isTTY) {
          const createdCount = steps.filter((s) => s.status === "created").length;
          const existingCount = steps.filter((s) => s.status === "exists").length;
          const summary =
            createdCount > 0 && existingCount > 0
              ? success("✓") + ` Created ${createdCount} items; found ${existingCount} existing items.`
              : createdCount > 0
                ? success("✓") + ` Created ${createdCount} items.`
                : existingCount > 0
                  ? success("✓") + ` Found ${existingCount} existing items.`
                  : success("✓") + " Prepared directories and files.";
          process.stdout.write("\n" + summary + "\n");
          for (const step of steps) {
            const statusText =
              step.status === "created"
                ? success("created")
                : step.status === "exists"
                  ? dim("already existed")
                  : step.status === "skipped"
                    ? dim("skipped")
                    : success("done");
            const pathPart = step.path ? " " + pathStyle(`(${step.path})`) : "";
            process.stdout.write(bullet(`${step.name}: ${statusText}${pathPart}`) + "\n");
          }
          process.stdout.write(nl());

          // Start temporary API once at start of init if needed (OAuth or dev_local); stop at end of init
          try {
            const config = await readConfig();
            const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
            if (!(await isApiReachable(baseUrl)) && repoRoot && isLocalHost(baseUrl)) {
              writeTemporaryApiStatusMessage(
                "API is not running. Starting temporary API for initialization...",
                outputMode
              );
              temporaryApiForInit = await startTemporaryApiForInit({
                repoRoot,
                baseUrl,
                outputMode,
                startedMessage: ".",
              });
            }
          } catch {
            // Non-fatal; auth steps may defer or skip
          }

          const configuredAuth = await detectConfiguredAuthMode(envPath);
          let authStatusNote: string | null = null;
          if (configuredAuth && !authModeFromFlag) {
            initAuthSummary.mode = configuredAuth.mode;
            authStatusNote = "configured in " + configuredAuth.source;
          } else {
            if (!authModeFromFlag && !useAdvancedPrompts) {
              initAuthSummary.mode = defaultInitAuthMode;
              authStatusNote = "default";
            } else {
              process.stdout.write(nl() + bullet(heading("Choose authentication mode")) + nl());
              if (!authModeFromFlag) {
                const optW = 6;
                const modeW = 36;
                const encW = 10;
                const header =
                  dim(
                    padToDisplayWidth("Option", optW) +
                      "  " +
                      padToDisplayWidth("Mode", modeW) +
                      "  " +
                      padToDisplayWidth("Encrypted", encW)
                  ) +
                  "\n" +
                  dim(
                    padToDisplayWidth("------", optW) +
                      "  " +
                      "-".repeat(modeW) +
                      "  " +
                      "-".repeat(encW)
                  );
                process.stdout.write(header + "\n");
                process.stdout.write(
                  padToDisplayWidth("1", optW) +
                    "  " +
                    padToDisplayWidth("Default user (no login)", modeW) +
                    "  " +
                    padToDisplayWidth("No", encW) +
                    "\n"
                );
                process.stdout.write(
                  padToDisplayWidth("2", optW) +
                    "  " +
                    padToDisplayWidth("Key-derived user", modeW) +
                    "  " +
                    padToDisplayWidth("Yes", encW) +
                    "\n"
                );
                const authChoice = await askQuestion("Auth mode [1-2] [default: 1]: ");
                initAuthSummary.mode = normalizeInitAuthMode(authChoice) ?? defaultInitAuthMode;
              }
            }
          }

          if (initAuthSummary.mode === "oauth") {
            const config = await readConfig();
            const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
            if (configuredAuth?.mode === "oauth" && !authModeFromFlag) {
              // Already configured — skip opening browser; show user ID if API is up
              try {
                const token = await getCliToken();
                if (token) {
                  const res = await fetch(`${baseUrl}/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(10000),
                  });
                  if (res.ok) {
                    const me = (await res.json()) as { user_id?: string };
                    process.stdout.write(
                      bullet(
                        success("✓") +
                          " Authenticated with OAuth; user ID " +
                          (me.user_id ?? "—") +
                          "." +
                          nl()
                      )
                    );
                  }
                }
              } catch {
                // Non-fatal: API may be down or token invalid
              }
            } else {
              const apiAlreadyRunning = await isApiReachable(baseUrl);
              if (!apiAlreadyRunning) {
                if (!repoRoot) {
                  initAuthSummary.oauthDeferredReason =
                    "OAuth selected but no repo root found for temporary API startup.";
                } else if (!isLocalHost(baseUrl)) {
                  initAuthSummary.oauthDeferredReason =
                    "OAuth selected but base URL is not local. Start your API manually, then run neotoma auth login.";
                }
              }
              if (!initAuthSummary.oauthDeferredReason) {
                try {
                  await runLoginFlow(baseUrl, false);
                  initAuthSummary.oauthCompleted = true;
                } catch (error) {
                  initAuthSummary.oauthDeferredReason = formatCliError(error);
                }
              }
            }
          } else if (initAuthSummary.mode === "key_derived") {
            process.stdout.write(nl());
            const keyChoice = await askQuestion(
              "Create new key [1] or path to existing key [2] [default: 1]: "
            );
            const wantCreate = keyChoice.trim() === "" || keyChoice.trim() === "1";
            if (wantCreate) {
              const keysDir = path.join(CONFIG_DIR, "keys");
              keyPath = path.join(keysDir, "neotoma.key");
              try {
                await fs.access(keyPath);
                process.stdout.write(
                  bullet("Key already exists at " + pathStyle(keyPath) + ". Using it.") + "\n"
                );
                steps.push({ name: "encryption-key", status: "exists", path: keyPath });
              } catch {
                await fs.mkdir(keysDir, { recursive: true });
                const keyBytes = randomBytes(32);
                await fs.writeFile(keyPath, keyBytes.toString("hex"), { mode: 0o600 });
                steps.push({ name: "encryption-key", status: "created", path: keyPath });
                process.stdout.write(
                  bullet("Created encryption key at " + pathStyle(keyPath)) + "\n"
                );
              }
            } else {
              const existingPath = await askQuestion("Path to existing key file [default: skip]: ");
              const resolved = existingPath.trim().replace(/^~(?=\/|$)/, process.env.HOME || "");
              if (!resolved) {
                process.stdout.write(
                  bullet(warn("No path entered. Set NEOTOMA_KEY_FILE_PATH in .env later.")) + "\n"
                );
              } else {
                try {
                  await fs.access(resolved);
                  keyPath = path.resolve(resolved);
                  steps.push({ name: "encryption-key", status: "exists", path: keyPath });
                  process.stdout.write(
                    bullet("Using existing key at " + pathStyle(keyPath)) + "\n"
                  );
                } catch {
                  process.stdout.write(
                    bullet(
                      warn(
                        "File not found: " +
                          resolved +
                          ". Set NEOTOMA_KEY_FILE_PATH in .env when ready."
                      )
                    ) + "\n"
                  );
                }
              }
            }
          }
          // Show user ID for dev_local (API already started at start of init if needed)
          if (initAuthSummary.mode === "dev_local") {
            try {
              const config = await readConfig();
              const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
              const res = await fetch(`${baseUrl.replace(/\/$/, "")}/me`, {
                signal: AbortSignal.timeout(15000),
              });
              if (res.ok) {
                const me = (await res.json()) as { user_id?: string };
                if (me.user_id) {
                  const note = authStatusNote ? ` (${authStatusNote})` : "";
                  writeMessage(
                    "\n" +
                      success("✓") +
                      " Authenticated as " +
                      initAuthModeLabel(initAuthSummary.mode) +
                      note +
                      "; user ID " +
                      me.user_id +
                      ".",
                    outputMode
                  );
                }
              }
            } catch {
              // Skip showing user ID on error (e.g. API not reachable)
            }
          }
        }

        let _envCreated = false;
        let _envConfigured = false;

        const INIT_ENV_VARS = [
          "NEOTOMA_DATA_DIR",
          "NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY",
          "OPENAI_API_KEY",
        ] as const;
        const SECRET_ENV_VARS = new Set(["OPENAI_API_KEY", "NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY"]);

        const parseEnvFile = (content: string): Record<string, string> => {
          const out: Record<string, string> = {};
          for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eq = trimmed.indexOf("=");
            if (eq <= 0) continue;
            const key = trimmed.slice(0, eq).trim();
            let val = trimmed.slice(eq + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!key) continue;
            out[key] = val;
          }
          return out;
        };

        const maskSecret = (value: string): string => {
          if (value.length <= 8) return "***";
          return value.slice(0, 6) + "…***";
        };

        if (process.stdout.isTTY && !opts.skipEnv && envPath && envExamplePath) {
          const envPathStr = envPath;
          let envExists = false;
          try {
            await fs.access(envPathStr);
            envExists = true;
          } catch {
            envExists = false;
          }

          const knownDefaults: Record<string, string> = {
            NEOTOMA_DATA_DIR: dataDir,
            NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY: mcpTokenEncryptionKey,
          };

          const ensureKnownVarsInEnv = async (): Promise<void> => {
            let envText: string;
            try {
              envText = await fs.readFile(envPathStr, "utf-8");
            } catch {
              return;
            }
            const parsed = parseEnvFile(envText);
            let changed = false;
            for (const [key, value] of Object.entries(knownDefaults)) {
              const current = parsed[key];
              if (current == null || String(current).trim() === "") {
                const keyLine = new RegExp(
                  `^#?\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`,
                  "m"
                );
                if (keyLine.test(envText)) {
                  envText = envText.replace(keyLine, key + "=" + value);
                } else {
                  envText = envText.trimEnd() + "\n" + key + "=" + value + "\n";
                }
                changed = true;
              }
            }
            if (changed) {
              await fs.writeFile(envPathStr, envText);
            }
          };

          if (envExists) {
            await ensureKnownVarsInEnv();
          }

          const resolved: Record<string, string | undefined> = { ...process.env };
          if (envExists) {
            try {
              const envText = await fs.readFile(envPathStr, "utf-8");
              Object.assign(resolved, parseEnvFile(envText));
            } catch {
              // keep process.env only
            }
          }
          // When .env does not exist, do not merge knownDefaults into resolved so we show
          // "not set" for vars that are not in process.env; after creating .env we write defaults via envContent.

          process.stdout.write(
            nl() + bullet(heading("Set environment variables") + " " + dim(pathStyle(envPathStr))) + nl()
          );
          for (const name of INIT_ENV_VARS) {
            const value = resolved[name];
            const set = value != null && String(value).trim() !== "";
            const display = set
              ? SECRET_ENV_VARS.has(name)
                ? maskSecret(String(value))
                : String(value)
              : "";
            const defaultVal = knownDefaults[name];
            const defaultHint =
              defaultVal != null && SECRET_ENV_VARS.has(name)
                ? dim("(set by init when creating .env)")
                : defaultVal != null
                  ? dim(`(default: ${defaultVal})`)
                  : dim("(not set)");
            const status = set
              ? success("already set") + (display ? " " + dim(`(${display})`) : "")
              : dim("optional") + " " + defaultHint;
            process.stdout.write(bullet(`${pathStyle(name)}: ${status}`) + "\n");
          }
          process.stdout.write(nl());

          if (!envExists) {
            const createEnv = useAdvancedPrompts
              ? await askYesNo("Create .env from .env.example and configure now? (y/n): ")
              : true;
            if (createEnv) {
              await fs.writeFile(envPathStr, envContent);
              _envCreated = true;
              process.stdout.write(
                bullet(success(".env created with detected paths and defaults.")) + "\n"
              );
              process.stdout.write(bullet(dim("Path: ") + pathStyle(envPathStr)) + "\n");
            }
          }

          const openAiSet =
            resolved.OPENAI_API_KEY != null && String(resolved.OPENAI_API_KEY).trim() !== "";
          const shouldPromptOpenAi = !opts.yes && outputMode === "pretty" && process.stdout.isTTY;
          if (!openAiSet && shouldPromptOpenAi) {
            const keyVal = await askQuestion(
              "OPENAI_API_KEY value [optional, Enter to skip]: "
            );
            if (keyVal.trim()) {
              let envText: string;
              try {
                envText = await fs.readFile(envPathStr, "utf-8");
              } catch {
                envText = await fs.readFile(envExamplePath, "utf-8");
              }
              const openAiLine = /^#?\s*OPENAI_API_KEY=.*$/m;
              if (openAiLine.test(envText)) {
                envText = envText.replace(
                  openAiLine,
                  "OPENAI_API_KEY=" + keyVal.replace(/\n/g, "")
                );
              } else {
                envText =
                  envText.trimEnd() + "\nOPENAI_API_KEY=" + keyVal.replace(/\n/g, "") + "\n";
              }
              await fs.writeFile(envPathStr, envText);
              process.stdout.write(bullet(success("OPENAI_API_KEY saved to .env.")) + "\n");
              _envConfigured = true;
            }
          } else if (envExists && useAdvancedPrompts) {
            const keyVal = await askQuestion(
              "OPENAI_API_KEY value [optional, Enter to skip]: "
            );
            if (keyVal.trim()) {
              let envText = await fs.readFile(envPathStr, "utf-8");
                const openAiLine = /^#?\s*OPENAI_API_KEY=.*$/m;
                if (openAiLine.test(envText)) {
                  envText = envText.replace(
                    openAiLine,
                    "OPENAI_API_KEY=" + keyVal.replace(/\n/g, "")
                  );
                } else {
                  envText =
                    envText.trimEnd() + "\nOPENAI_API_KEY=" + keyVal.replace(/\n/g, "") + "\n";
                }
              await fs.writeFile(envPathStr, envText);
              process.stdout.write(bullet(success("OPENAI_API_KEY updated in .env.")) + "\n");
              _envConfigured = true;
            }
          }
          // When user created/selected a key during init, write NEOTOMA_KEY_FILE_PATH to .env so key-auth works
          if (keyPath) {
            try {
              let envText = await fs.readFile(envPathStr, "utf-8");
              const keyPathLine = /^#?\s*NEOTOMA_KEY_FILE_PATH=.*$/m;
              if (keyPathLine.test(envText)) {
                envText = envText.replace(keyPathLine, "NEOTOMA_KEY_FILE_PATH=" + keyPath);
              } else {
                envText = envText.trimEnd() + "\nNEOTOMA_KEY_FILE_PATH=" + keyPath + "\n";
              }
              await fs.writeFile(envPathStr, envText);
              keyPathWrittenToEnv = true;
            } catch {
              // .env may not exist if user skipped create
            }
          }
        }
        if (keyPath) {
          process.stdout.write(nl() + heading("Encryption enabled") + nl());
          process.stdout.write(keyValue("Key file", keyPath, true) + "\n");
          process.stdout.write(
            bullet("Add to .env: " + pathStyle("NEOTOMA_ENCRYPTION_ENABLED=true")) + "\n"
          );
          process.stdout.write(
            bullet(
              keyPathWrittenToEnv
                ? "Set in .env: " + pathStyle("NEOTOMA_KEY_FILE_PATH=" + keyPath)
                : "Add to .env: " + pathStyle("NEOTOMA_KEY_FILE_PATH=" + keyPath)
            ) + "\n"
          );
          process.stdout.write(
            nl() + warn("Back up your key file. Data cannot be recovered without it.") + nl()
          );
        }

        // MCP config: offer to add dev/prod servers if scan found configs missing them.
        // In init, show the same Initialization table used by session startup so MCP + CLI status are aligned.
        let mcpInstallResult:
          | { installed: boolean; message: string; scope?: "project" | "user" | "both"; updatedPaths?: string[] }
          | undefined;
        if (outputMode === "pretty" && process.stdout.isTTY && mcpScan.repoRoot) {
          try {
            const { scanAgentInstructions } = await import("./agent_instructions_scan.js");
            await scanAgentInstructions(mcpScan.repoRoot, {
              includeUserLevel: true,
            });
          } catch {
            // Best-effort scan for setup hints; continue init on scan failures.
          }
        }
        if (mcpMissingProd && mcpScan.repoRoot) {
          try {
            const { offerInstall } = await import("./mcp_config_scan.js");
            mcpInstallResult = await offerInstall(mcpScan.configs, mcpScan.repoRoot, {
              boxAlreadyShown: outputMode === "pretty" && process.stdout.isTTY,
              ...(useAdvancedPrompts
                ? {}
                : {
                    autoInstallEnv: "prod" as const,
                    autoInstallScope: "user" as const,
                    skipProjectSync: true,
                  }),
            });
            if (
              mcpInstallResult?.installed &&
              mcpInstallResult.updatedPaths &&
              mcpInstallResult.updatedPaths.length > 0
            ) {
              process.stdout.write(
                success("✓ ") +
                  "Added MCP configuration to: " +
                  mcpInstallResult.updatedPaths.join(", ") +
                  nl()
              );
            }
          } catch {
            process.stdout.write(
              nl() +
                dim("Run ") +
                pathStyle("neotoma mcp check") +
                dim(
                  " later to add production server (or development+production) to your MCP configurations."
                ) +
                nl()
            );
          }
        }

        if (outputMode === "pretty" && process.stdout.isTTY && mcpScan.repoRoot) {
          try {
            const configureCli = useAdvancedPrompts
              ? await askYesNo(
                  "Configure CLI instructions (prefer MCP when available, CLI as backup)? (y/n): "
                )
              : true;
            if (configureCli) {
              const { scanAgentInstructions, offerAddPreferCliRule } =
                await import("./agent_instructions_scan.js");
              const scanResult = await scanAgentInstructions(mcpScan.repoRoot, {
                includeUserLevel: true,
              });
              if (scanResult.missingInApplied || scanResult.needsUpdateInApplied) {
                const { added, skipped } = await offerAddPreferCliRule(scanResult, {
                  nonInteractive: false,
                  ...(useAdvancedPrompts ? {} : { scope: "user" as const }),
                });
                if (added.length > 0) {
                  process.stdout.write(
                    success("✓ ") + "Added CLI instructions to: " + added.join(", ") + nl()
                  );
                } else if (skipped) {
                  process.stdout.write(
                    dim("CLI instructions are already up to date for the selected scope.") + nl()
                  );
                }
              } else {
                process.stdout.write(dim("CLI instructions are already up to date.") + nl());
              }
            }
          } catch {
            process.stdout.write(dim("Could not check CLI instructions.") + nl());
          }
        }

        // Persist repo root so "neotoma" can start servers from any cwd
        let configRepoRoot = repoRoot ?? (await readConfig()).repo_root;
        // In pretty mode (not json), ask for repo root if not found
        if (!configRepoRoot && outputMode === "pretty" && useAdvancedPrompts) {
          const pathInput = await askQuestion(
            "Path to Neotoma repo [default: skip]: "
          );
          if (pathInput) {
            const validated = await validateNeotomaRepo(pathInput);
            if (validated) configRepoRoot = validated;
          }
        }
        {
          const config = await readConfig();
          const nextConfig: Config = {
            ...config,
            ...(configRepoRoot ? { repo_root: configRepoRoot } : {}),
            ...(initAuthSummary.mode !== "skip" ? { init_auth_mode: initAuthSummary.mode } : {}),
          };
          await writeConfig(nextConfig);
        }

        process.stdout.write(nl());

        if (temporaryApiForInit) {
          await stopTemporaryApiForInit(temporaryApiForInit.child);
          writeTemporaryApiStatusMessage("Stopped temporary API.", outputMode);
        }

        process.stdout.write(nl() + heading("✓ Neotoma initialized!") + nl());
        process.stdout.write(
          dim("Next step: run ") + pathStyle("neotoma") + dim(" to start a session.") + nl()
        );
        if (!envRepoRoot) {
          process.stdout.write(
            bullet(
              dim(
                ".env is created when run from the repo, when a repo path is saved in config, or when you enter a repo path during init. Data is under ~/neotoma/data."
              )
            ) + "\n"
          );
        }
      } catch (err) {
        if (err instanceof InitAbortError) {
          process.stdout.write("\n");
          process.exit(0);
        }
        throw err;
      }
    }
  );

// ── Site configure (Google Analytics and env vars) ─────────────────────────

const siteCommand = program
  .command("site")
  .description("Site and frontend configuration");

siteCommand
  .command("configure")
  .description(
    "Configure site env vars: Google Analytics (VITE_GA_MEASUREMENT_ID) and optional Google API credentials"
  )
  .option("--ga-measurement-id <id>", "GA4 measurement ID (e.g. G-XXXXXXXXXX)")
  .option(
    "--google-application-credentials <path>",
    "Path to Google application credentials JSON (server-side APIs)"
  )
  .option(
    "--google-oauth-credentials <path>",
    "Path to Google OAuth credentials file or directory (e.g. .creds)"
  )
  .action(
    async (opts: {
      gaMeasurementId?: string;
      googleApplicationCredentials?: string;
      googleOauthCredentials?: string;
    }) => {
      const outputMode = resolveOutputMode();
      let repoRoot: string | null = null;
      try {
        const config = await readConfig();
        if (config.repo_root) repoRoot = await validateNeotomaRepo(config.repo_root);
        if (!repoRoot && process.env.NEOTOMA_REPO_ROOT) {
          repoRoot = await validateNeotomaRepo(process.env.NEOTOMA_REPO_ROOT);
        }
        if (!repoRoot) repoRoot = await findRepoRoot(process.cwd());
      } catch {
        // leave null
      }
      if (!repoRoot) {
        process.stderr.write(
          "Not a Neotoma repo. Run from the repo root or run " +
            pathStyle("neotoma init") +
            " first.\n"
        );
        process.exitCode = 1;
        return;
      }
      const envPath = path.join(repoRoot, ".env");
      const envExamplePath = path.join(repoRoot, ".env.example");
      if (!(await pathExists(envPath))) {
        if (await pathExists(envExamplePath)) {
          await fs.copyFile(envExamplePath, envPath);
          if (outputMode === "pretty") {
            process.stdout.write(
              bullet(success("Created .env from .env.example")) + "\n"
            );
          }
        } else {
          await fs.writeFile(envPath, "");
          if (outputMode === "pretty") {
            process.stdout.write(bullet(success("Created empty .env")) + "\n");
          }
        }
      }

      let gaId = opts.gaMeasurementId?.trim();
      let googleAppCreds = opts.googleApplicationCredentials?.trim();
      let googleOauthCreds = opts.googleOauthCredentials?.trim();
      if (process.stdout.isTTY && outputMode === "pretty") {
        if (gaId === undefined || gaId === "") {
          const raw = await askQuestion(
            "VITE_GA_MEASUREMENT_ID (GA4 measurement ID, e.g. G-XXXXXXXXXX) [optional, Enter to skip]: "
          );
          gaId = raw.trim();
        }
        if (googleAppCreds === undefined || googleAppCreds === "") {
          const raw = await askQuestion(
            "GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON) [optional, Enter to skip]: "
          );
          googleAppCreds = raw.trim();
        }
        if (googleOauthCreds === undefined || googleOauthCreds === "") {
          const raw = await askQuestion(
            "GOOGLE_OAUTH_CREDENTIALS (path, e.g. .creds) [optional, Enter to skip]: "
          );
          googleOauthCreds = raw.trim();
        }
      }

      const updated: string[] = [];
      // Apply when option was explicitly passed (including empty) or user entered non-empty at prompt
      if (opts.gaMeasurementId !== undefined) {
        await updateOrInsertEnvVar(
          envPath,
          "VITE_GA_MEASUREMENT_ID",
          opts.gaMeasurementId.trim()
        );
        updated.push("VITE_GA_MEASUREMENT_ID");
      } else if (gaId !== undefined && gaId !== "") {
        await updateOrInsertEnvVar(envPath, "VITE_GA_MEASUREMENT_ID", gaId);
        updated.push("VITE_GA_MEASUREMENT_ID");
      }
      if (opts.googleApplicationCredentials !== undefined) {
        await updateOrInsertEnvVar(
          envPath,
          "GOOGLE_APPLICATION_CREDENTIALS",
          opts.googleApplicationCredentials.trim()
        );
        updated.push("GOOGLE_APPLICATION_CREDENTIALS");
      } else if (googleAppCreds !== undefined && googleAppCreds !== "") {
        await updateOrInsertEnvVar(
          envPath,
          "GOOGLE_APPLICATION_CREDENTIALS",
          googleAppCreds
        );
        updated.push("GOOGLE_APPLICATION_CREDENTIALS");
      }
      if (opts.googleOauthCredentials !== undefined) {
        await updateOrInsertEnvVar(
          envPath,
          "GOOGLE_OAUTH_CREDENTIALS",
          opts.googleOauthCredentials.trim()
        );
        updated.push("GOOGLE_OAUTH_CREDENTIALS");
      } else if (googleOauthCreds !== undefined && googleOauthCreds !== "") {
        await updateOrInsertEnvVar(
          envPath,
          "GOOGLE_OAUTH_CREDENTIALS",
          googleOauthCreds
        );
        updated.push("GOOGLE_OAUTH_CREDENTIALS");
      }

      if (outputMode === "json") {
        writeOutput(
          { env_file: envPath, updated_vars: updated },
          outputMode
        );
        return;
      }
      if (updated.length > 0) {
        process.stdout.write(
          heading("Site env vars updated") + "\n"
        );
        process.stdout.write(keyValue("env_file", envPath, true) + "\n");
        process.stdout.write(
          bullet("Set or updated: " + updated.join(", ")) + "\n"
        );
      } else {
        process.stdout.write(
          dim("No values provided. Use options or run interactively to set vars.") + "\n"
        );
        process.stdout.write(
          dim("  ") +
            pathStyle("neotoma site configure --ga-measurement-id G-XXXXXXXXXX") +
            "\n"
        );
        process.stdout.write(
          dim("  ") +
            pathStyle(
              "neotoma site configure --google-application-credentials '' --google-oauth-credentials .creds"
            ) +
            "\n"
        );
      }
    }
  );

let resetCompletionPrinted = false;

program
  .command("reset")
  .description(
    "Reset local Neotoma initialization state: backup configuration and environment files (and repo-local data when NEOTOMA_DATA_DIR is unset or points inside repo), backup CLI instruction copies, remove Neotoma MCP installs from user and repository configurations"
  )
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (opts: { yes?: boolean }) => {
    const outputMode = resolveOutputMode();
    const { repoRoot } = await resolveRepoRootFromInitContext();
    const ts = backupTimestamp();

    // Core candidates: always show in "Skipped (not present)" if missing
    const coreBackupCandidates: string[] = [CONFIG_DIR];
    // Optional candidates: only show in skipped if they actually existed at some point (move-if-present only, silent otherwise)
    const optionalBackupCandidates: string[] = [];
    if (repoRoot) {
      const envPath = path.join(repoRoot, ".env");
      const envVars = await readEnvFileVars(envPath);
      const envDataDir = envVars.NEOTOMA_DATA_DIR?.trim();
      // Back up repo-local data dir when using default data/ or NEOTOMA_DATA_DIR points inside repo.
      if (envDataDir == null || envDataDir.length === 0) {
        coreBackupCandidates.push(path.join(repoRoot, "data"));
      } else {
        const configuredDataDir = resolvePathInput(envDataDir, repoRoot);
        const [normalizedConfiguredDataDir, normalizedRepoRoot] = await Promise.all([
          normalizePathForContainmentCheck(configuredDataDir),
          normalizePathForContainmentCheck(repoRoot),
        ]);
        if (isPathWithinDirectory(normalizedConfiguredDataDir, normalizedRepoRoot)) {
          coreBackupCandidates.push(configuredDataDir);
        }
      }
      optionalBackupCandidates.push(path.join(repoRoot, "keys"), envPath);
    }
    const backupCandidates = [...coreBackupCandidates, ...optionalBackupCandidates];

    const cliInstructionPaths: string[] = [];
    if (repoRoot) {
      const { PROJECT_APPLIED_RULE_PATHS } = await import("./agent_instructions_scan.js");
      for (const rel of Object.values(PROJECT_APPLIED_RULE_PATHS)) {
        cliInstructionPaths.push(path.join(repoRoot, rel));
      }
    }
    const userRulePaths = (await import("./agent_instructions_scan.js")).getUserAppliedRulePaths();
    if (userRulePaths) {
      cliInstructionPaths.push(userRulePaths.cursor, userRulePaths.claude, userRulePaths.codex);
    }

    const mcpConfigTargets = new Set<string>(userLevelMcpConfigPaths());
    if (repoRoot) {
      mcpConfigTargets.add(path.join(repoRoot, ".cursor", "mcp.json"));
      mcpConfigTargets.add(path.join(repoRoot, ".mcp.json"));
      mcpConfigTargets.add(path.join(repoRoot, ".codex", "config.toml"));
    }

    if (process.stdout.isTTY && !opts.yes && outputMode !== "json") {
      process.stdout.write(heading("Neotoma reset") + nl() + nl());
      process.stdout.write("This will:" + nl());
      process.stdout.write(
        bullet(
          "Back up local configuration and environment files (and repo-local data when NEOTOMA_DATA_DIR is unset or points inside repo) to timestamped copies."
        ) + nl()
      );
      process.stdout.write(
        bullet("Back up neotoma_cli instruction files in user and repo.") + nl()
      );
      process.stdout.write(bullet("Remove Neotoma MCP entries from user and repo configs.") + nl());
      process.stdout.write(nl());
      const ok = await askYesNo("Continue with reset? (y/n): ");
      if (!ok) {
        process.stdout.write("Reset cancelled." + nl());
        return;
      }
    }

    const cliInstructionPathSet = new Set(cliInstructionPaths);
    const allBackupSources = [...backupCandidates, ...cliInstructionPaths];
    const moved: Array<{ from: string; to: string }> = [];
    for (const src of allBackupSources) {
      const to = await movePathToTimestampBackup(src, ts);
      if (to) moved.push({ from: src, to });
    }
    const movedFromSet = new Set(moved.map((m) => m.from));
    // Only report skipped for core paths; optional paths (keys, .env) are moved if present and silently skipped if not
    const skippedBackupCandidates = coreBackupCandidates.filter((src) => !movedFromSet.has(src));
    const movedCliCount = moved.filter((m) => cliInstructionPathSet.has(m.from)).length;

    const mcpCleaned: string[] = [];
    for (const configPath of mcpConfigTargets) {
      const isCodexToml = configPath.endsWith("config.toml");
      const changed = isCodexToml
        ? await removeNeotomaCodexMarkerBlock(configPath)
        : await removeNeotomaServersFromJsonMcpConfig(configPath);
      if (changed) mcpCleaned.push(configPath);
    }

    if (outputMode === "json") {
      writeOutput(
        {
          success: true,
          repo_root: repoRoot,
          timestamp: ts,
          backups_moved: moved,
          mcp_configs_updated: mcpCleaned,
        },
        outputMode
      );
      return;
    }

    if (!resetCompletionPrinted) {
      resetCompletionPrinted = true;
      // Backups
      if (moved.length > 0) {
        process.stdout.write(nl() + bold("Backed up:") + nl());
        for (const item of moved) {
          process.stdout.write(bullet(pathStyle(item.from) + " -> " + pathStyle(item.to)) + nl());
        }
      }
      if (skippedBackupCandidates.length > 0) {
        process.stdout.write(nl() + bold("Not present:") + nl());
        for (const src of skippedBackupCandidates) {
          process.stdout.write(bullet(dim(pathStyle(src))) + nl());
        }
      }
      if (moved.length === 0 && skippedBackupCandidates.length === 0) {
        process.stdout.write(nl() + bullet(dim("Nothing to back up.")) + nl());
      }

      process.stdout.write(nl());
      if (cliInstructionPaths.length > 0 && movedCliCount === 0) {
        process.stdout.write(bullet(dim("No neotoma_cli instruction files found.")) + nl());
      }
      if (mcpCleaned.length > 0) {
        process.stdout.write(bold("MCP configs cleaned:") + nl());
        for (const p of mcpCleaned) {
          process.stdout.write(bullet(pathStyle(p)) + nl());
        }
      } else {
        process.stdout.write(bullet(dim("No Neotoma MCP entries to clean.")) + nl());
      }

      process.stdout.write(nl() + heading("Neotoma reset complete.") + nl());
      process.stdout.write(dim("Next step: ") + pathStyle("neotoma init") + nl());
    }
  });

const authCommand = program.command("auth").description("Authentication commands");

const DEFAULT_TUNNEL_URL_FILE = "/tmp/ngrok-mcp-url.txt";

const authLoginCommand = authCommand
  .command("login")
  .description("Login using OAuth PKCE")
  .option("--dev-stub", "Use local dev stub authentication (local backend only)")
  .option(
    "--tunnel",
    "Use tunnel URL from " + DEFAULT_TUNNEL_URL_FILE + " (for testing OAuth when API is behind tunnel)"
  )
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const loginOpts = authLoginCommand.opts() as { devStub?: boolean; tunnel?: boolean };
    let baseUrl: string;
    if (loginOpts.tunnel) {
      const urlFile = process.env.NGROK_URL_FILE ?? DEFAULT_TUNNEL_URL_FILE;
      try {
        const raw = await fs.readFile(urlFile, "utf-8");
        const url = raw.trim().replace(/\/$/, "");
        if (!url) throw new Error("Tunnel URL file is empty");
        const isLocal =
          url.startsWith("http://127.0.0.1") ||
          url.startsWith("http://localhost") ||
          url.startsWith("https://127.0.0.1") ||
          url.startsWith("https://localhost");
        if (isLocal) {
          const msg =
            "Tunnel URL file contains localhost; use the tunnel URL for OAuth. Start the API with a tunnel and wait until it is ready: neotoma api start --env dev --tunnel (then cat /tmp/ngrok-mcp-url.txt should show the tunnel URL).";
          if (outputMode === "json") {
            writeOutput({ ok: false, error: msg, tunnel_url_file: urlFile, read_url: url }, outputMode);
          } else {
            process.stderr.write(`neotoma auth login: ${msg}\n`);
            process.stderr.write(`  (File ${urlFile} contained: ${url})\n`);
          }
          process.exitCode = 1;
          return;
        }
        baseUrl = url;
      } catch {
        const msg =
          "No tunnel URL found. Start the API with a tunnel first: neotoma api start --env dev --tunnel";
        if (outputMode === "json") {
          writeOutput({ ok: false, error: msg, tunnel_url_file: urlFile }, outputMode);
        } else {
          process.stderr.write(`neotoma auth login: ${msg}\n`);
          process.stderr.write(`  (Looked in ${urlFile})\n`);
        }
        process.exitCode = 1;
        return;
      }
    } else {
      baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
    }
    let token: string | undefined;
    try {
      token = await getCliToken();
    } catch {
      token = undefined;
    }
    if (token) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      try {
        const res = await fetch(`${baseUrl}/me`, { headers, signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const me = (await res.json()) as { user_id?: string; email?: string };
          if (outputMode === "json") {
            writeOutput(
              {
                message: "Already signed in",
                base_url: baseUrl,
                user_id: me.user_id,
                email: me.email,
              },
              outputMode
            );
          } else {
            process.stdout.write("Already signed in");
            if (me.user_id ?? me.email) {
              process.stdout.write(` (${[me.email, me.user_id].filter(Boolean).join(", ")})`);
            }
            process.stdout.write(".\n");
          }
          return;
        }
      } catch {
        // Fall through to login if /me fails (e.g. server down)
      }
    }
    await runLoginFlow(baseUrl, Boolean(loginOpts.devStub));
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
      const res = await fetch(`${baseUrl}/me`, { headers });
      if (res.ok) {
        const me = (await res.json()) as { user_id?: string; email?: string };
        if (me.user_id) status.user_id = me.user_id;
        if (me.email != null) status.email = me.email;
      }
    } catch {
      // Omit user details if /me fails (e.g. server unreachable)
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
            "Run `neotoma auth login` to create an OAuth connection (the browser will require key authentication first).",
            "Add the JSON above to .cursor/mcp.json in your project (or Cursor user config).",
            "Use your connection_id from `neotoma auth status` as X-Connection-Id.",
            "If you cannot complete key-authenticated OAuth, configure Authorization: Bearer <NEOTOMA_BEARER_TOKEN> instead.",
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
      numbered(
        1,
        "Create an OAuth connection (browser key-auth required): " + pathStyle("neotoma auth login")
      ) + "\n"
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
        "If key-authenticated OAuth is unavailable, use Authorization bearer token (NEOTOMA_BEARER_TOKEN) instead."
      ) + "\n"
    );
    process.stdout.write(
      numbered(
        5,
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
        process.stdout.write(heading("MCP configuration check") + nl() + nl());
        process.stdout.write(
          "No MCP configuration files found (user-level or project-level)." + nl()
        );
        process.stdout.write(nl());
      } else {
        process.stdout.write(heading("MCP configuration check") + nl() + nl());
        process.stdout.write(
          "Found " + bold(String(configs.length)) + " MCP configuration file(s):" + nl() + nl()
        );

        for (const config of configs) {
          const devStatus = config.hasDev ? success("✓ configured") : warn("✗ missing");
          const prodStatus = config.hasProd ? success("✓ configured") : warn("✗ missing");
          process.stdout.write("  " + pathStyle(config.path) + nl());
          process.stdout.write("    Development: " + devStatus + nl());
          process.stdout.write("    Production:  " + prodStatus + nl());
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

      if (result.installed && process.stdout.isTTY && repoRoot) {
        try {
          const { scanAgentInstructions, offerAddPreferCliRule } =
            await import("./agent_instructions_scan.js");
          const scanResult = await scanAgentInstructions(repoRoot, { includeUserLevel: true });
          if (scanResult.missingInApplied || scanResult.needsUpdateInApplied) {
            const { added, skipped } = await offerAddPreferCliRule(scanResult, {
              nonInteractive: false,
              scope: result.scope,
            });
            if (added.length > 0) {
              process.stdout.write(
                success("✓ ") + "Added CLI instructions to: " + added.join(", ") + nl()
              );
            } else if (skipped) {
              process.stdout.write(
                dim("CLI instructions are already up to date for the selected scope.") + nl()
              );
            }
          }
        } catch {
          process.stdout.write(dim("Could not check CLI instructions.") + nl());
        }
      }

      process.stdout.write(
        dim("Tip: Run ") +
          pathStyle("neotoma cli-instructions check") +
          dim(" to add the rule to Cursor, Claude, and Codex.") +
          nl()
      );
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
  .description(
    "Show guidance for adding 'prefer MCP when available, CLI as backup' to Cursor, Claude, and Codex"
  )
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
      "Add the rule so it is applied in Cursor, Claude Code, and Codex (only paths each IDE loads count)." +
        nl()
    );
    process.stdout.write(
      dim("Rule content source: ") + pathStyle("docs/developer/cli_agent_instructions.md") + nl()
    );
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
      dim("Run ") +
        pathStyle("neotoma cli-instructions check") +
        dim(" to add to missing environments.") +
        nl()
    );
    process.stdout.write(
      dim("Docs: ") + pathStyle("docs/developer/agent_cli_configuration.md") + nl()
    );
  });

agentInstructionsCommand
  .command("check")
  .description(
    "Scan for 'prefer MCP when available, CLI as backup' in Cursor, Claude, and Codex applied paths; offer to add if missing"
  )
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

      process.stdout.write(heading("CLI instructions check") + nl() + nl());
      process.stdout.write("Project root: " + pathStyle(result.projectRoot) + nl() + nl());

      const fmtStatus = (ok: boolean, sym: boolean) =>
        ok ? success("✓") + dim(sym ? " symlink" : " file") : dim("○ missing");
      const userPaths = getUserAppliedRulePaths();
      const projRoot = result.projectRoot;

      process.stdout.write(bold("Applied (loaded by each IDE):") + nl());

      process.stdout.write("  " + bold("Project") + nl());
      const projEntries = [
        {
          label: "Cursor",
          ok: result.appliedProject.cursor,
          sym: result.symlinkProject.cursor,
          relPath: PROJECT_APPLIED_RULE_PATHS.cursor,
        },
        {
          label: "Claude",
          ok: result.appliedProject.claude,
          sym: result.symlinkProject.claude,
          relPath: PROJECT_APPLIED_RULE_PATHS.claude,
        },
        {
          label: "Codex",
          ok: result.appliedProject.codex,
          sym: result.symlinkProject.codex,
          relPath: PROJECT_APPLIED_RULE_PATHS.codex,
        },
      ];
      for (const e of projEntries) {
        process.stdout.write(
          "    " +
            fmtStatus(e.ok, e.sym) +
            "  " +
            e.label +
            "  " +
            dim(path.join(projRoot, e.relPath)) +
            nl()
        );
      }

      process.stdout.write("  " + bold("User") + nl());
      const userEntries = userPaths
        ? [
            {
              label: "Cursor",
              ok: result.appliedUser.cursor,
              sym: result.symlinkUser.cursor,
              p: userPaths.cursor,
            },
            {
              label: "Claude",
              ok: result.appliedUser.claude,
              sym: result.symlinkUser.claude,
              p: userPaths.claude,
            },
            {
              label: "Codex",
              ok: result.appliedUser.codex,
              sym: result.symlinkUser.codex,
              p: userPaths.codex,
            },
          ]
        : [];
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
        !result.appliedProject.cursor ||
        !result.appliedProject.claude ||
        !result.appliedProject.codex;
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
          parts.push(
            "Not applied at user level in: " +
              missingEnvs.join(", ") +
              " (user rules apply to all projects)"
          );
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
        process.stdout.write(warn(parts.join(". ") + ".") + nl());
        if (process.stdin.isTTY && !opts.yes) {
          const { added, skipped } = await offerAddPreferCliRule(result, { nonInteractive: false });
          if (added.length > 0) {
            process.stdout.write(success("Added or updated rule at:") + nl());
            for (const p of added) {
              process.stdout.write("  " + pathStyle(p) + nl());
            }
          } else if (skipped) {
            process.stdout.write(
              dim("Already up to date for the chosen scope. Nothing written.") + nl()
            );
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
          process.stdout.write(
            nl() + dim("Source: docs/developer/cli_agent_instructions.md") + nl()
          );
          process.stdout.write(dim("Snippet:") + nl() + nl());
          process.stdout.write(snippetBody.trim().slice(0, 400) + "…" + nl());
        }
      } else {
        process.stdout.write(
          success(
            "Instruction applied and up to date at project and user level (Cursor, Claude, Codex)."
          ) + nl()
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
  .command("watch [env]")
  .description("Stream record changes from the database as they happen (local backend only).")
  .option("--env <env>", "Environment: dev, prod, or all (same as first argument)")
  .option("--interval <ms>", "Polling interval in ms", "400")
  .option("--json", "Output NDJSON (one JSON object per line)")
  .option("--human", "Output one plain line per change (no timestamps, emoji, or IDs)")
  .option("--tail", "Only show changes from now (skip existing records)")
  .action(
    async (
      envArg: string | undefined,
      optsOrCmd:
        | { env?: string; interval?: string; json?: boolean; human?: boolean; tail?: boolean }
        | Command
    ) => {
      const opts =
        typeof (optsOrCmd as Command).opts === "function"
          ? ((optsOrCmd as Command).opts() as {
              env?: string;
              interval?: string;
              json?: boolean;
              human?: boolean;
              tail?: boolean;
            })
          : (optsOrCmd as {
              env?: string;
              interval?: string;
              json?: boolean;
              human?: boolean;
              tail?: boolean;
            });
      const watchEnvFlag = (envArg ?? opts.env)?.toLowerCase();
      if (watchEnvFlag !== "dev" && watchEnvFlag !== "prod" && watchEnvFlag !== "all") {
        process.stderr.write(
          "neotoma watch: specify environment as first argument (e.g. watch dev) or --env dev, --env prod, or --env all.\n"
        );
        process.exit(1);
      }
      if (watchEnvFlag === "all") {
        const showCrossEnvRecent = async (
          repoRoot: string,
          userId: string | null
        ): Promise<void> => {
          const events = await getLastNWatchEntriesAcrossEnvs(
            repoRoot,
            userId,
            WATCH_INITIAL_EVENT_LIMIT
          );
          lastShownWatchEvents = events.length > 0 ? events : null;
          if (events.length > 0) {
            const watchLines = formatWatchTable(events, new Date());
            const sessionBoxWidth = getTerminalWidth();
            process.stdout.write(
              "\n" +
                blackBox(watchLines, {
                  title: " Recent events (development + production) ",
                  borderColor: "green",
                  padding: 1,
                  sessionBoxWidth,
                }) +
                "\n"
            );
            if (sessionWatchState) {
              sessionWatchDisplayRef = { watchLines, watchEventCount: events.length };
              process.stdout.write(
                dim("  View details: enter row number (1–" + events.length + ") at the prompt.") +
                  "\n"
              );
            }
          } else {
            if (sessionWatchState) sessionWatchDisplayRef = null;
            process.stdout.write("\n" + dim("No recent events.") + "\n");
          }
          process.stdout.write(
            dim(
              "Live stream is per-environment. Use --env dev (development) or --env prod (production) to stream."
            ) + "\n"
          );
        };
        if (sessionWatchState) {
          await showCrossEnvRecent(sessionWatchState.repoRoot, sessionWatchState.userId);
          return;
        }
        const config = await readConfig();
        let token: string | undefined;
        try {
          token = await getCliToken();
        } catch {
          process.stderr.write(
            "neotoma watch --env all requires auth to resolve user. Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC when encryption is on.\n"
          );
          process.exit(1);
        }
        const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        let userId: string | null = null;
        try {
          const res = await fetch(`${baseUrl}/me`, { headers });
          if (res.ok) {
            const me = (await res.json()) as { user_id?: string };
            if (me.user_id) userId = me.user_id;
          }
        } catch {
          // ignore
        }
        let repoRoot = process.env.NEOTOMA_PROJECT_ROOT ?? process.cwd();
        try {
          const pkgPath = path.join(process.cwd(), "package.json");
          const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string };
          if (pkg.name === "neotoma") repoRoot = process.cwd();
        } catch {
          // not in neotoma repo
        }
        await showCrossEnvRecent(repoRoot, userId);
        return;
      }
      if (sessionWatchState) {
        sessionWatchState.enabled = true;
        const events = await getLastNWatchEntries(
          sessionWatchState.repoRoot,
          watchEnvFlag,
          sessionWatchState.userId,
          WATCH_INITIAL_EVENT_LIMIT,
          watchEnvFlag
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
            dim(
              "  View details: enter row number (1–" +
                events.length +
                ") at the prompt after exiting."
            ) + "\n"
          );
        } else {
          sessionWatchDisplayRef = null;
          process.stdout.write("\n" + dim("No recent events.") + "\n");
        }
        sessionWatchState.stop = await startSessionWatch(
          sessionWatchState.repoRoot,
          sessionWatchState.onEvent,
          watchEnvFlag
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
        const res = await fetch(`${baseUrl}/me`, { headers });
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
      const watchEnv: "dev" | "prod" = watchEnvFlag;
      const defaultDbFile = watchEnv === "prod" ? "neotoma.prod.db" : "neotoma.db";
      const sqlitePath = path.join(dataDir, defaultDbFile);

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
          const rows = stmt.all(...entityIds, forUserId) as {
            id: string;
            canonical_name: string;
          }[];
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
      const skipInitial = Boolean(opts.tail) || jsonMode || humanMode;

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
    }
  );

const storageCommand = program.command("storage").description("Storage locations and file paths");

storageCommand
  .command("info")
  .description("Show where CLI configuration and server data are stored (file paths and backend)")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = (await resolveBaseUrl(program.opts().baseUrl, config)).replace(/\/$/, "");

    const storageBackend = "local";
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
    const isProd = (process.env.NEOTOMA_ENV || "development") === "production";
    const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
    const sqlitePath = path.join(dataDir, defaultDbFile);
    const rawStorageSubdir = isProd ? "sources_prod" : "sources";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const rawStorageDir =
      process.env.NEOTOMA_RAW_STORAGE_DIR ||
      (typeof dataDir === "string" && dataDir !== "data"
        ? path.join(dataDir, rawStorageSubdir)
        : path.join("data", rawStorageSubdir));
    const logsDir =
      process.env.NEOTOMA_LOGS_DIR ||
      (typeof dataDir === "string" && dataDir !== "data"
        ? path.join(dataDir, logsSubdir)
        : path.join("data", logsSubdir));
    const eventLogFileName = isProd ? "events.prod.log" : "events.log";
    const eventLogPath =
      process.env.NEOTOMA_EVENT_LOG_PATH ||
      (process.env.NEOTOMA_EVENT_LOG_DIR
        ? path.join(process.env.NEOTOMA_EVENT_LOG_DIR, eventLogFileName)
        : path.join(dataDir, "logs", eventLogFileName));

    const info: Record<string, unknown> = {
      config_file: CONFIG_PATH,
      config_description: "CLI credentials and base URL (local only)",
      server_url: baseUrl,
      server_description: "API base URL (your data is served from this backend).",
      storage_backend: storageBackend,
      storage_paths: {
        data_dir: dataDir,
        sqlite_db: sqlitePath,
        raw_sources: rawStorageDir,
        event_log: eventLogPath,
        logs: logsDir,
        description:
          "Local backend: SQLite DB and raw files under data/. Defaults are env-specific (dev: data/sources, data/logs, neotoma.db; prod: data/sources_prod, data/logs_prod, neotoma.prod.db). Event log: data/logs/events.log (dev), data/logs/events.prod.log (prod). Override with NEOTOMA_DATA_DIR, NEOTOMA_SQLITE_PATH, NEOTOMA_RAW_STORAGE_DIR, NEOTOMA_EVENT_LOG_PATH, NEOTOMA_LOGS_DIR, NEOTOMA_PROJECT_ROOT.",
      },
    };

    if (outputMode === "json") {
      writeOutput(info, outputMode);
      return;
    }

    process.stdout.write(heading("Storage and configuration locations") + nl() + nl());
    process.stdout.write(keyValue("Config file (CLI)", String(info.config_file), true) + "\n");
    process.stdout.write(bullet(String(info.config_description)) + nl());
    process.stdout.write(keyValue("Server", String(info.server_url), true) + "\n");
    process.stdout.write(bullet(String(info.server_description)) + nl());
    process.stdout.write(keyValue("Backend", storageBackend) + "\n");
    if (info.storage_paths && typeof info.storage_paths === "object") {
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
    }
  });

storageCommand
  .command("set-data-dir <dir>")
  .description("Set NEOTOMA_DATA_DIR and optionally copy/merge DB files into the new directory")
  .option("--move-db-files", "Copy DB files from current data dir into the new directory")
  .option("--no-move-db-files", "Do not copy DB files; only update NEOTOMA_DATA_DIR")
  .option(
    "--on-conflict <strategy>",
    "When both dirs contain DB files: merge, overwrite, or use-new"
  )
  .option("--yes", "Skip interactive prompts and use provided flags")
  .action(
    async (
      targetDirInput: string,
      maybeOpts:
        | {
            moveDbFiles?: boolean;
            onConflict?: string;
            yes?: boolean;
          }
        | Command
    ) => {
      const opts =
        typeof (maybeOpts as Command).opts === "function"
          ? (maybeOpts as Command).opts<{
              moveDbFiles?: boolean;
              onConflict?: string;
              yes?: boolean;
            }>()
          : (maybeOpts as {
              moveDbFiles?: boolean;
              onConflict?: string;
              yes?: boolean;
            });
      const outputMode = resolveOutputMode();
      const interactive = process.stdout.isTTY && outputMode !== "json" && !opts.yes;

      const { repoRoot } = await resolveRepoRootFromInitContext();
      if (!repoRoot) {
        writeCliError(INIT_REQUIRED_MESSAGE);
        return;
      }

      const envPath = path.join(repoRoot, ".env");
      const envVars = await readEnvFileVars(envPath);
      const configuredDataDir = envVars.NEOTOMA_DATA_DIR?.trim();
      const currentDataDir =
        configuredDataDir && configuredDataDir.length > 0
          ? resolvePathInput(configuredDataDir, repoRoot)
          : path.join(repoRoot, "data");
      const targetDataDir = resolvePathInput(targetDirInput, repoRoot);

      await fs.mkdir(targetDataDir, { recursive: true });

      const sourceDbFiles = await listExistingDbFiles(currentDataDir);
      const targetDbFiles = await listExistingDbFiles(targetDataDir);
      const sourceBaseFiles = SQLITE_DB_BASE_FILES.filter((base) => sourceDbFiles.has(base));
      const targetBaseFiles = new Set(
        SQLITE_DB_BASE_FILES.filter((base) => targetDbFiles.has(base))
      );
      const conflictingBases = sourceBaseFiles.filter((base) => targetBaseFiles.has(base));

      const validConflictOptions = new Set(["merge", "overwrite", "use-new"]);
      const requestedConflict =
        typeof opts.onConflict === "string" ? opts.onConflict.trim().toLowerCase() : "";
      if (requestedConflict && !validConflictOptions.has(requestedConflict)) {
        throw new Error("Invalid --on-conflict value. Expected one of: merge, overwrite, use-new.");
      }

      let shouldMoveDbFiles = opts.moveDbFiles === true;
      if (opts.moveDbFiles == null && interactive) {
        shouldMoveDbFiles = await askYesNo(
          "Copy DB files from current data dir to the new data dir? (y/n): "
        );
      }

      let conflictStrategy: "merge" | "overwrite" | "use-new" | null = null;
      if (shouldMoveDbFiles && conflictingBases.length > 0) {
        if (requestedConflict) {
          conflictStrategy = requestedConflict as "merge" | "overwrite" | "use-new";
        } else if (interactive) {
          process.stdout.write(
            heading("DB files already exist in the new directory") + nl() + nl()
          );
          process.stdout.write(
            bullet("merge: keep target DBs and insert missing rows from old DBs") + nl()
          );
          process.stdout.write(
            bullet("overwrite: replace target DBs with old DB files (after backup)") + nl()
          );
          process.stdout.write(
            bullet("use-new: keep target DB files as-is and skip copying old DBs") + nl()
          );
          process.stdout.write(nl());
          const choiceRaw = (
            await askQuestion(
              "Choose conflict strategy [merge/overwrite/use-new] (default: use-new): "
            )
          )
            .trim()
            .toLowerCase();
          if (choiceRaw === "merge" || choiceRaw === "overwrite" || choiceRaw === "use-new") {
            conflictStrategy = choiceRaw;
          } else {
            conflictStrategy = "use-new";
          }
        } else {
          conflictStrategy = "use-new";
        }
      }

      const timestamp = backupTimestamp();
      const copiedDbFiles: string[] = [];
      const backedUpDbFiles: string[] = [];
      const removedTargetFiles: string[] = [];
      const mergeStats: DbMergeStats[] = [];

      if (shouldMoveDbFiles && sourceDbFiles.size > 0) {
        if (conflictingBases.length === 0) {
          copiedDbFiles.push(
            ...(await copyDbFilesByName(currentDataDir, targetDataDir, sourceDbFiles))
          );
        } else if (conflictStrategy === "use-new") {
          // Explicitly keep existing target DB files unchanged.
        } else if (conflictStrategy === "overwrite") {
          for (const baseName of conflictingBases) {
            const targetFiles = buildDbFamily(baseName)
              .map((name) => path.join(targetDataDir, name))
              .filter((filePath) => targetDbFiles.has(path.basename(filePath)));
            backedUpDbFiles.push(...(await backupFilesWithTimestamp(targetFiles, timestamp)));
          }
          removedTargetFiles.push(...(await removeDbFilesByName(targetDataDir, targetDbFiles)));
          copiedDbFiles.push(
            ...(await copyDbFilesByName(currentDataDir, targetDataDir, sourceDbFiles))
          );
        } else {
          const conflictingBaseSet = new Set(conflictingBases);
          for (const baseName of conflictingBases) {
            const targetFiles = buildDbFamily(baseName)
              .map((name) => path.join(targetDataDir, name))
              .filter((filePath) => targetDbFiles.has(path.basename(filePath)));
            backedUpDbFiles.push(...(await backupFilesWithTimestamp(targetFiles, timestamp)));
          }

          const nonConflictingSourceFiles = [...sourceDbFiles].filter((name) => {
            for (const base of conflictingBaseSet) {
              if (name === base || name === `${base}-wal` || name === `${base}-shm`) return false;
            }
            return true;
          });
          copiedDbFiles.push(
            ...(await copyDbFilesByName(currentDataDir, targetDataDir, nonConflictingSourceFiles))
          );

          for (const baseName of conflictingBases) {
            const sourceDbPath = path.join(currentDataDir, baseName);
            const targetDbPath = path.join(targetDataDir, baseName);
            if (!(await pathExists(sourceDbPath)) || !(await pathExists(targetDbPath))) continue;
            const stats = mergeSqliteDatabase(sourceDbPath, targetDbPath);
            mergeStats.push(stats);
          }
        }
      }

      await updateOrInsertEnvVar(envPath, "NEOTOMA_DATA_DIR", targetDataDir);

      const result = {
        status: "updated",
        env_file: envPath,
        old_data_dir: currentDataDir,
        new_data_dir: targetDataDir,
        db_files_in_old_dir: [...sourceDbFiles].sort(),
        db_files_in_new_dir_before: [...targetDbFiles].sort(),
        move_db_files: shouldMoveDbFiles,
        conflict_bases: conflictingBases,
        conflict_strategy: conflictStrategy,
        backups_created: backedUpDbFiles,
        copied_files: copiedDbFiles,
        removed_target_files: removedTargetFiles,
        merge_stats: mergeStats,
        old_dir_preserved: true,
      };

      if (outputMode === "json") {
        writeOutput(result, outputMode);
        return;
      }

      process.stdout.write(heading("Data directory updated") + nl() + nl());
      process.stdout.write(keyValue("old_data_dir", currentDataDir, true) + "\n");
      process.stdout.write(keyValue("new_data_dir", targetDataDir, true) + "\n");
      process.stdout.write(keyValue("env_file", envPath, true) + "\n");
      if (shouldMoveDbFiles) {
        process.stdout.write(bullet("DB file copy behavior executed.") + nl());
      } else {
        process.stdout.write(
          bullet("DB files were not copied; only NEOTOMA_DATA_DIR was updated.") + nl()
        );
      }
      if (conflictingBases.length > 0) {
        process.stdout.write(
          bullet(
            `Conflict bases: ${conflictingBases.join(", ")} (strategy: ${conflictStrategy ?? "use-new"})`
          ) + nl()
        );
      }
      if (backedUpDbFiles.length > 0) {
        process.stdout.write(bullet(`Backups created (${backedUpDbFiles.length}):`) + nl());
        for (const backup of backedUpDbFiles) {
          process.stdout.write("  " + pathStyle(backup) + "\n");
        }
      }
      if (mergeStats.length > 0) {
        process.stdout.write(bullet("Merge summary:") + nl());
        for (const stats of mergeStats) {
          process.stdout.write(
            "  " +
              pathStyle(path.basename(stats.target_db)) +
              dim(
                ` tables=${stats.tables_scanned}, inserted=${stats.rows_inserted}, ignored=${stats.rows_ignored}`
              ) +
              "\n"
          );
        }
      }
      process.stdout.write(bullet("Old directory DB files were left in place.") + nl());
    }
  );

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
    const isProd = (process.env.NEOTOMA_ENV || "development") === "production";
    const defaultDbFile = isProd ? "neotoma.prod.db" : "neotoma.db";
    const sqlitePath = path.join(dataDir, defaultDbFile);
    const rawStorageSubdir = isProd ? "sources_prod" : "sources";
    const logsSubdir = isProd ? "logs_prod" : "logs";
    const rawStorageDir =
      process.env.NEOTOMA_RAW_STORAGE_DIR || path.join(dataDir, rawStorageSubdir);
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
        "User must preserve private key file (~/.config/neotoma/keys/) or mnemonic phrase for restore",
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

    // Copy logs directory (includes events.log and other log files)
    try {
      await fs.access(logsDir);
      const dirName = path.basename(logsDir);
      await fs.cp(logsDir, path.join(backupDir, dirName), { recursive: true });
      contents[dirName] = dirName + "/";
    } catch {
      // Directory does not exist
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
  .option("--file <path>", "Specific log file path (default: latest in data/logs, env-specific)")
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
    const isProd = (process.env.NEOTOMA_ENV || "development") === "production";
    const logsSubdir = isProd ? "logs_prod" : "logs";

    let logFilePath = opts.file;
    if (!logFilePath) {
      const logsDirResolved = process.env.NEOTOMA_LOGS_DIR || path.join(dataDir, logsSubdir);
      try {
        const files = await fs.readdir(logsDirResolved);
        const logFiles = files.filter((f) => f.endsWith(".jsonl") || f.endsWith(".log"));
        if (logFiles.length > 0) {
          logFiles.sort().reverse();
          logFilePath = path.join(logsDirResolved, logFiles[0]);
        }
      } catch {
        // directory does not exist
      }
    }

    if (!logFilePath) {
      writeCliError("No log files found in env-specific data/logs (dev: logs; prod: logs_prod).");
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
            const wmic = execSync(
              `wmic process where processid=${pid} get commandline /format:list`,
              {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
              }
            );
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

/**
 * Detect Neotoma MCP stdio server processes (e.g. spawned by Cursor via run_neotoma_mcp_stdio.sh).
 * Uses pgrep on Unix; returns 0 on Windows or on error. Does not count this CLI process.
 */
async function detectNeotomaMcpStdioProcessCount(): Promise<number> {
  if (process.platform === "win32") return 0;
  try {
    const out = execSync('pgrep -f "run_neotoma_mcp_stdio"', {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const pids = out
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid);
    return pids.length;
  } catch {
    return 0;
  }
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
  .option(
    "--tunnel",
    "Start HTTPS tunnel (ngrok/cloudflared) with the API for remote MCP access; tunnel URL written to /tmp/ngrok-mcp-url.txt"
  )
  .option(
    "--tunnel-provider <provider>",
    "Tunnel provider: ngrok or cloudflare (default: auto-detect from installed tools)"
  )
  .action(async (opts: { background?: boolean; tunnel?: boolean; tunnelProvider?: string }) => {
    const outputMode = resolveOutputMode();
    const envOpt = (program.opts() as { env?: string }).env;
    if (envOpt !== "dev" && envOpt !== "prod") {
      const error = "Specify --env dev or --env prod for server commands.";
      if (outputMode === "json") {
        writeOutput({ ok: false, error }, outputMode);
        return;
      }
      process.stderr.write(`neotoma api start: ${error}\n`);
      return;
    }
    const tunnelProvider = opts.tunnelProvider?.toLowerCase();
    if (tunnelProvider && tunnelProvider !== "ngrok" && tunnelProvider !== "cloudflare") {
      const error = "Invalid --tunnel-provider; use ngrok or cloudflare.";
      if (outputMode === "json") {
        writeOutput({ ok: false, error }, outputMode);
        return;
      }
      process.stderr.write(`neotoma api start: ${error}\n`);
      return;
    }
    const effectiveEnv = envOpt === "prod" ? "production" : "development";
    const apiLogsDir = path.join(CONFIG_DIR, effectiveEnv === "production" ? "logs_prod" : "logs");
    const apiLogPath = path.join(apiLogsDir, "api.log");
    const apiPidPath = path.join(
      CONFIG_DIR,
      effectiveEnv === "production" ? "api_prod.pid" : "api.pid"
    );

    if (opts.background) {
      const repoRoot = await maybeRunInitForMissingRepo(
        process.stdout.isTTY && outputMode !== "json"
      );
      if (!repoRoot) {
        if (outputMode === "json") {
          writeOutput(
            {
              ok: false,
              error: INIT_REQUIRED_MESSAGE,
            },
            outputMode
          );
          return;
        }
        process.stderr.write(INIT_REQUIRED_MESSAGE + "\n");
        return;
      }

      await fs.mkdir(apiLogsDir, { recursive: true });
      const logStream = (await fs.open(apiLogPath, "a")).createWriteStream();
      const logLine = "\n--- neotoma api start (" + new Date().toISOString() + ") ---\n";
      logStream.write(logLine);

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const childScript = opts.tunnel
        ? envOpt === "prod"
          ? "watch:prod:tunnel"
          : "dev:api"
        : envOpt === "prod"
          ? "dev:prod"
          : "dev:server";
      const spawnEnv: Record<string, string> = { ...process.env, NEOTOMA_ENV: effectiveEnv };
      if (tunnelProvider) spawnEnv.NEOTOMA_TUNNEL_PROVIDER = tunnelProvider;
      const child = spawn(npmCmd, ["run", childScript], {
        cwd: repoRoot,
        detached: true,
        stdio: ["ignore", logStream, logStream],
        env: spawnEnv,
      });
      child.unref();
      await fs.writeFile(apiPidPath, String(child.pid ?? ""));

      if (outputMode === "json") {
        writeOutput(
          {
            ok: true,
            pid: child.pid,
            env: envOpt,
            tunnel: opts.tunnel ?? false,
            log_file: apiLogPath,
            message: "API server started in background. Use 'neotoma api logs' to view logs.",
          },
          outputMode
        );
        return;
      }
      process.stdout.write(heading("API server started in background.") + nl());
      process.stdout.write(keyValue("PID", String(child.pid ?? "unknown")) + "\n");
      process.stdout.write(keyValue("Env", envOpt) + "\n");
      process.stdout.write(keyValue("Logs", apiLogPath, true) + "\n");
      if (opts.tunnel) {
        process.stdout.write(
          bullet("Tunnel URL when ready: " + pathStyle("cat /tmp/ngrok-mcp-url.txt") + "\n")
        );
        process.stdout.write(
          bullet(
            "MCP config: set " +
              pathStyle("url") +
              " to " +
              dim("https://<tunnel-url>/mcp") +
              " in .cursor/mcp.json, or run " +
              pathStyle("neotoma mcp config") +
              "\n"
          )
        );
        process.stdout.write(
          bullet(
            "OAuth requires key authentication in-browser first; if unavailable, use Authorization: Bearer <NEOTOMA_BEARER_TOKEN>."
          ) + "\n"
        );
      }
      process.stdout.write(
        bullet("View logs: " + pathStyle("neotoma api logs") + " (use --follow to stream)") + "\n"
      );
      return;
    }

    // Foreground: run API (and tunnel if requested) in this process (unless --json, then emit command info only)
    if (outputMode === "json") {
      writeOutput(
        {
          commands: {
            dev: "npm run dev:server",
            dev_prod: "npm run dev:prod",
            dev_api_tunnel: "npm run dev:api",
            watch_prod_tunnel: "npm run watch:prod:tunnel",
            start_api: "npm run start:api",
            start_api_prod: "npm run start:api:prod",
          },
          ports: { default: 8080, prod: 8180 },
          message:
            "To run in foreground, omit --json. Use --background to start in background and get PID.",
        },
        outputMode
      );
      return;
    }
    const repoRoot = await maybeRunInitForMissingRepo(true);
    if (!repoRoot) {
      process.stderr.write(INIT_REQUIRED_MESSAGE + "\n");
      return;
    }
    const useTunnel =
      opts.tunnel === true ||
      (program.opts() as { tunnel?: boolean }).tunnel === true ||
      process.argv.includes("--tunnel");
    if (process.stdout.isTTY && useTunnel) {
      process.stdout.write(
        dim("Tunnel URL when ready: ") +
          pathStyle("cat /tmp/ngrok-mcp-url.txt") +
          dim(". For Cursor: set url to https://<tunnel-url>/mcp in .cursor/mcp.json, or run ") +
          pathStyle("neotoma mcp config") +
          dim(". OAuth requires key authentication in-browser; otherwise use Authorization bearer token (NEOTOMA_BEARER_TOKEN).") +
          ".\n\n"
      );
    }
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const childScript = useTunnel
      ? envOpt === "prod"
        ? "watch:prod:tunnel"
        : "dev:api"
      : envOpt === "prod"
        ? "dev:prod"
        : "dev:server";
    const spawnEnv: Record<string, string> = { ...process.env, NEOTOMA_ENV: effectiveEnv };
    if (tunnelProvider) spawnEnv.NEOTOMA_TUNNEL_PROVIDER = tunnelProvider;
    const child = spawn(npmCmd, ["run", childScript], {
      cwd: repoRoot,
      stdio: "inherit",
      env: spawnEnv,
    });
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("close", (code, _sig) => resolve(code ?? null));
    });
    if (useTunnel && exitCode !== null && exitCode !== 0) {
      process.stderr.write(
        dim("Tunnel failed to start. ") +
          "Install and authenticate ngrok (" +
          pathStyle("ngrok config add-authtoken <token>") +
          ") or install cloudflared and use " +
          pathStyle("--tunnel-provider cloudflare") +
          ". See docs/developer/tunnels.md.\n"
      );
    }
    process.exitCode = exitCode ?? 0;
  });

apiCommand
  .command("stop")
  .description("Stop the API server process on the configured port")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const envOpt = (program.opts() as { env?: string }).env;
    if (envOpt !== "dev" && envOpt !== "prod") {
      const error = "Specify --env dev or --env prod for server commands.";
      if (outputMode === "json") {
        writeOutput({ ok: false, error }, outputMode);
        return;
      }
      process.stderr.write(`neotoma api stop: ${error}\n`);
      return;
    }
    const port = envOpt === "prod" ? 8180 : 8080;

    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.join(scriptDir, "..", "..");
    const killPortScript = path.join(repoRoot, "scripts", "kill_port.js");

    let ran = false;
    try {
      const scriptExists = await fs
        .access(killPortScript)
        .then(() => true)
        .catch(() => false);
      if (scriptExists) {
        execSync('node "' + killPortScript + '" ' + port, {
          stdio: outputMode === "json" ? "ignore" : "inherit",
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
          env: envOpt,
          port,
          stop_ran: ran,
          message: ran
            ? "Stop command completed for port " + port + "."
            : "Run from repo root to stop: node scripts/kill_port.js " + port,
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
            pathStyle("node scripts/kill_port.js " + port) +
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
      writeOutput({ processes: rows, ports_checked: CANDIDATE_API_PORTS }, outputMode);
      return;
    }
    process.stdout.write(heading("Neotoma API server processes") + nl());
    process.stdout.write(dim("Ports checked: " + CANDIDATE_API_PORTS.join(", ") + nl()));
    if (rows.length === 0) {
      process.stdout.write(
        dim("No processes listening on " + CANDIDATE_API_PORTS.join(" or ") + ".") + nl()
      );
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
      dim("To stop a process: ") +
        pathStyle("neotoma api stop") +
        dim(" (configured port) or ") +
        pathStyle("node scripts/kill_port.js <port>") +
        dim(" from repo root.") +
        nl()
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
    const envOpt = (program.opts() as { env?: string }).env;
    if (envOpt !== "dev" && envOpt !== "prod") {
      const error = "Specify --env dev or --env prod for server commands.";
      if (outputMode === "json") {
        writeOutput({ ok: false, error }, outputMode);
        return;
      }
      process.stderr.write(`neotoma api logs: ${error}\n`);
      return;
    }
    const effectiveEnv = envOpt === "prod" ? "production" : "development";
    const apiLogsDir = path.join(CONFIG_DIR, effectiveEnv === "production" ? "logs_prod" : "logs");
    const apiLogPath = path.join(apiLogsDir, "api.log");

    let exists = false;
    try {
      await fs.access(apiLogPath);
      exists = true;
    } catch {
      // file missing
    }

    if (!exists) {
      if (outputMode === "json") {
        writeOutput(
          {
            env: envOpt,
            log_file: apiLogPath,
            error:
              "No log file. Start the API with 'neotoma api start --background --env dev' to capture logs.",
          },
          outputMode
        );
        return;
      }
      process.stderr.write("No log file found.\n");
      process.stderr.write(
        "Start the API in the background to capture logs: neotoma api start --background --env dev\n"
      );
      return;
    }

    if (outputMode === "json" && !opts.follow) {
      const content = await fs.readFile(apiLogPath, "utf-8");
      const allLines = content.split("\n");
      const tail = allLines.slice(-lines);
      writeOutput(
        { env: envOpt, log_file: apiLogPath, lines: tail.length, content: tail.join("\n") },
        outputMode
      );
      return;
    }

    const content = await fs.readFile(apiLogPath, "utf-8");
    const allLines = content.split("\n");
    const tail = allLines.slice(-lines);
    process.stdout.write(tail.join("\n"));
    if (tail.length > 0 && !tail[tail.length - 1]?.endsWith("\n")) {
      process.stdout.write("\n");
    }

    if (opts.follow) {
      process.stdout.write("--- following (Ctrl+C to stop) ---\n");
      let lastSize = (await fs.stat(apiLogPath)).size;
      const interval = setInterval(async () => {
        try {
          const stat = await fs.stat(apiLogPath);
          if (stat.size > lastSize) {
            const fd = await fs.open(apiLogPath, "r");
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
    const entityId = args.length > 1 ? (args[0] as string | undefined) : undefined;

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
      const { data, error, response } = await api.GET("/entities/{id}", {
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
        const { data: relData } = await api.GET("/entities/{id}/relationships", {
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
    const { data, error, response } = await api.POST("/entities/query", {
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
    const { data, error, response } = await api.GET("/entities/{id}", {
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
      const { data: relData } = await api.GET("/entities/{id}/relationships", {
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
  .action(
    async (
      identifierArg: string | undefined,
      opts: { identifier?: string; entityType?: string; userId?: string }
    ) => {
      const identifier = opts.identifier ?? identifierArg;
      const outputMode = resolveOutputMode();
      const config = await readConfig();
      const token = await getCliToken();
      const api = createApiClient({
        baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
        token,
      });
      if (!identifier)
        throw new Error("identifier is required (positional argument or --identifier)");
      const { data, error } = await api.POST("/retrieve_entity_by_identifier", {
        body: {
          identifier,
          entity_type: opts.entityType,
        },
      });
      if (error) throw new Error("Failed to search entity");
      writeOutput(data, outputMode);
    }
  );

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
  .action(
    async (
      entityId: string,
      entityTypeArg: string | undefined,
      opts: { entityType?: string; reason?: string; userId?: string }
    ) => {
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
          user_id: opts.userId,
        },
      });
      if (error) throw new Error("Failed to delete entity");
      writeOutput(data, outputMode);
    }
  );

entitiesCommand
  .command("restore")
  .description("Restore a deleted entity (creates restoration observation)")
  .argument("<entityId>", "Entity ID to restore")
  .argument("[entityType]", "Entity type (optional)")
  .option("--entity-type <type>", "Entity type (alternative to positional argument)")
  .option("--reason <reason>", "Optional reason for restoration")
  .option("--user-id <userId>", "User ID")
  .action(
    async (
      entityId: string,
      entityTypeArg: string | undefined,
      opts: { entityType?: string; reason?: string; userId?: string }
    ) => {
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
          user_id: opts.userId,
        },
      });
      if (error) throw new Error("Failed to restore entity");
      writeOutput(data, outputMode);
    }
  );

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
    const { data, error, response } = await api.GET("/sources/{id}", {
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
      process.stdout.write(formatSourcePropertiesTable(rec) + "\n");
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
    const { data, error } = await api.GET("/sources", {
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
    const { data, error } = await api.POST("/observations/query", {
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
    const { data, error } = await api.POST("/observations/query", {
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
    const { data, error } = await api.GET("/relationships", {
      params: {
        query: {
          source_entity_id: opts.sourceEntityId,
          target_entity_id: opts.targetEntityId,
          relationship_type: opts.relationshipType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        } as any,
      } as any,
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
    const { data, error } = await api.GET("/relationships/{id}", {
      params: { path: { id: encodeURIComponent(opts.relationshipId) } },
    });
    if (error) throw new Error("Failed to get relationship");
    writeOutput({ relationship: data }, outputMode);
  });

relationshipsCommand
  .command("delete")
  .description("Delete a relationship (creates deletion observation, reversible)")
  .option(
    "--relationship-id <id>",
    "Relationship ID (relationship_key, format: type:source:target)"
  )
  .option(
    "--source-entity-id <id>",
    "Source entity ID (use with --target-entity-id and --relationship-type)"
  )
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
      if (parts.length < 3)
        throw new Error("Invalid relationship ID format (expected type:source:target)");
      const [type, ...rest] = parts;
      relationshipType = type;
      targetEntityId = rest.pop() as string;
      sourceEntityId = rest.join(":");
    } else {
      throw new Error(
        "Provide --relationship-id OR (--source-entity-id, --target-entity-id, --relationship-type)"
      );
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
    const { data, error } = await api.POST("/relationships/snapshot", {
      body: {
        relationship_type: relationshipType as
          | "PART_OF"
          | "CORRECTS"
          | "REFERS_TO"
          | "SETTLES"
          | "DUPLICATE_OF"
          | "DEPENDS_ON"
          | "SUPERSEDES"
          | "EMBEDS",
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
  .option(
    "--relationship-id <id>",
    "Relationship ID (relationship_key, format: type:source:target)"
  )
  .option(
    "--source-entity-id <id>",
    "Source entity ID (use with --target-entity-id and --relationship-type)"
  )
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
      if (parts.length < 3)
        throw new Error("Invalid relationship ID format (expected type:source:target)");
      const [type, ...rest] = parts;
      relationshipType = type;
      targetEntityId = rest.pop() as string;
      sourceEntityId = rest.join(":");
    } else {
      throw new Error(
        "Provide --relationship-id OR (--source-entity-id, --target-entity-id, --relationship-type)"
      );
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
  .option("--user-id <userId>", "Filter by user ID (default: authenticated user)")
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
    const { data, error } = await api.GET("/timeline", {
      params: {
        query: {
          start_date: opts.startDate,
          end_date: opts.endDate,
          event_type: opts.eventType,
          entity_id: opts.entityId,
          user_id: opts.userId,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list timeline events");
    writeOutput(data, outputMode);
  });

timelineCommand
  .command("get")
  .description("Get one timeline event by ID")
  .option("--event-id <id>", "Timeline event ID (required)")
  .option("--user-id <userId>", "User ID (default: authenticated user)")
  .action(async (opts: { eventId?: string; userId?: string }) => {
    const outputMode = resolveOutputMode();
    if (!opts.eventId) throw new Error("--event-id is required");
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.GET("/timeline/{id}", {
      params: {
        path: {
          id: opts.eventId,
        },
        query: {
          user_id: opts.userId,
        },
      },
    });
    if (error) throw new Error("Failed to get timeline event");
    const event = (data as { event?: { id?: string } } | null)?.event;
    if (!event) throw new Error("Timeline event not found");
    writeOutput({ event }, outputMode);
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
    const { data, error } = await api.GET("/schemas", {
      params: {
        query: {
          entity_type: opts.entityType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        } as any,
      } as any,
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
    const { data, error } = await api.GET("/schemas/{entity_type}", {
      params: {
        path: { entity_type: opts.entityType },
        query: { user_id: opts.userId } as any,
      } as any,
    });
    if (error) throw new Error("Failed to fetch schema");
    const schemaData = data as Record<string, unknown> | null;
    const normalized = schemaData
      ? {
          ...schemaData,
          fields:
            (schemaData["schema_definition"] as Record<string, unknown> | undefined)?.["fields"] ??
            schemaData["fields"],
        }
      : schemaData;
    writeOutput({ schema: normalized }, outputMode);
  });

schemasCommand
  .command("analyze")
  .description("Analyze raw_fragments to identify schema candidate fields")
  .argument("[entityType]", "Entity type to analyze (or use --entity-type)")
  .option("--entity-type <type>", "Entity type to analyze (alternative to positional argument)")
  .option("--user-id <userId>", "User ID")
  .option("--min-confidence <n>", "Minimum confidence score 0-1", "0.8")
  .option("--min-frequency <n>", "Minimum frequency threshold", "5")
  .action(
    async (
      entityTypeArg: string | undefined,
      opts: { entityType?: string; userId?: string; minConfidence?: string; minFrequency?: string }
    ) => {
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
    }
  );

schemasCommand
  .command("recommend")
  .description("Get schema update recommendations for an entity type")
  .argument("[entityType]", "Entity type (or use --entity-type)")
  .option("--entity-type <type>", "Entity type to get recommendations for")
  .option("--user-id <userId>", "User ID")
  .option("--source <source>", "Recommendation source: raw_fragments, agent, inference, all", "all")
  .option("--status <status>", "Filter by status: pending, approved, rejected", "pending")
  .action(
    async (
      entityTypeArg: string | undefined,
      opts: { entityType?: string; userId?: string; source?: string; status?: string }
    ) => {
      const outputMode = resolveOutputMode();
      const entityTypeResolved = opts.entityType ?? entityTypeArg;
      if (!entityTypeResolved)
        throw new Error("entity type is required (positional argument or --entity-type)");
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
    }
  );

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
  .action(
    async (
      entityTypeArg: string | undefined,
      opts: {
        entityType?: string;
        fields?: string;
        userId?: string;
        activate?: boolean;
        migrateExisting?: boolean;
        schemaVersion?: string;
        userSpecific?: boolean;
      }
    ) => {
      const outputMode = resolveOutputMode();
      const entityType = opts.entityType ?? entityTypeArg;
      if (!entityType)
        throw new Error("entity type is required (positional argument or --entity-type)");
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
      const updateResult = data as Record<string, unknown> | null;
      if (
        updateResult &&
        typeof updateResult["schema"] === "object" &&
        updateResult["schema"] !== null
      ) {
        const schemaObj = updateResult["schema"] as Record<string, unknown>;
        const normalizedSchema = {
          ...schemaObj,
          fields:
            (schemaObj["schema_definition"] as Record<string, unknown> | undefined)?.["fields"] ??
            schemaObj["fields"],
        };
        writeOutput({ ...updateResult, schema: normalizedSchema }, outputMode);
      } else {
        writeOutput(data, outputMode);
      }
    }
  );

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
  .action(
    async (
      entityTypeArg: string | undefined,
      opts: {
        entityType?: string;
        fields?: string;
        schema?: string;
        userId?: string;
        schemaVersion?: string;
        activate?: boolean;
        migrateExisting?: boolean;
        userSpecific?: boolean;
      }
    ) => {
      const outputMode = resolveOutputMode();
      const entityType = opts.entityType ?? entityTypeArg;
      if (!entityType)
        throw new Error("entity type is required (positional argument or --entity-type)");
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
      const registerResult = data as Record<string, unknown> | null;
      if (
        registerResult &&
        typeof registerResult["schema"] === "object" &&
        registerResult["schema"] !== null
      ) {
        const schemaObj = registerResult["schema"] as Record<string, unknown>;
        const normalizedSchema = {
          ...schemaObj,
          fields:
            (schemaObj["schema_definition"] as Record<string, unknown> | undefined)?.["fields"] ??
            schemaObj["fields"],
        };
        writeOutput({ ...registerResult, schema: normalizedSchema }, outputMode);
      } else {
        writeOutput(data, outputMode);
      }
    }
  );

program
  .command("store")
  .description("Store structured entities, unstructured files, or both in one request")
  .option("--entities <json>", "Inline JSON array of entities (legacy structured store)")
  .option("--file <path>", "Path to JSON file containing entity array (legacy structured store)")
  .option("--file-path <path>", "Path to any file to store (unstructured pipeline)")
  .option("--file-content <content>", "Inline file content to store")
  .option("--user-id <id>", "User ID for the operation")
  .option("--interpret <bool>", "Run AI interpretation after store (default: false)", "false")
  .option("--source-priority <level>", "Source priority level (default: 100)")
  .option("--idempotency-key <key>", "Idempotency key to prevent duplicate stores")
  .option(
    "--file-idempotency-key <key>",
    "Optional idempotency key for file path in combined store"
  )
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });

    let entities: unknown;
    if (opts.entities) {
      entities = JSON.parse(opts.entities as string);
    } else if (opts.file) {
      const raw = await fs.readFile(opts.file, "utf-8");
      entities = JSON.parse(raw);
    }
    const hasStructured = Array.isArray(entities);
    const hasUnstructured = Boolean(opts.filePath || opts.fileContent);

    if (!hasStructured && !hasUnstructured) {
      throw new Error("Provide --file-path, --file-content, --entities, or --file");
    }

    let unstructuredBody: Record<string, unknown> = {};
    if (hasUnstructured) {
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
      unstructuredBody = {
        file_content: contentBase64,
        mime_type: mimeType,
        original_filename: originalFilename,
        interpret: shouldInterpret,
      };
      if (opts.fileIdempotencyKey) {
        unstructuredBody.file_idempotency_key = opts.fileIdempotencyKey;
      } else if (!hasStructured && opts.idempotencyKey) {
        unstructuredBody.idempotency_key = opts.idempotencyKey;
      }
    }

    if (entities && !Array.isArray(entities)) {
      throw new Error("Entities must be an array");
    }

    const structuredBody: Record<string, unknown> = {};
    if (hasStructured) {
      const idempotencyKey = opts.idempotencyKey ?? createIdempotencyKey({ entities });
      structuredBody.entities = entities;
      structuredBody.idempotency_key = idempotencyKey;
      if (opts.sourcePriority) {
        const parsedPriority = parseInt(opts.sourcePriority as string, 10);
        if (!Number.isNaN(parsedPriority)) {
          structuredBody.source_priority = parsedPriority;
        }
      }
    }

    const { data, error } = await api.POST("/store", {
      body: {
        ...structuredBody,
        ...unstructuredBody,
        interpret: hasUnstructured ? Boolean((unstructuredBody as any).interpret) : false,
        user_id: opts.userId,
      },
    });
    if (error) throw new Error(`Failed to store payload: ${JSON.stringify(error)}`);
    const storeResult = data as Record<string, unknown> | null;

    if (storeResult && hasStructured && !hasUnstructured) {
      const entitiesList = Array.isArray((storeResult as any).entities)
        ? ((storeResult as any).entities as any[])
        : [];
      const created = entitiesList
        .map((e) => ({ id: (e?.entity_id ?? e?.id) as string | undefined }))
        .filter((e) => typeof e.id === "string" && e.id.length > 0);
      writeOutput(
        {
          ...storeResult,
          entities_created_count: (storeResult as any).entities_created,
          entities_created: created,
        },
        outputMode
      );
      return;
    }

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

    const { data, error } = await api.POST("/store", {
      body: {
        entities: entityArray,
        idempotency_key: idempotencyKey,
        source_priority: sourcePriority,
        original_filename: originalFilename,
        interpret: false,
        user_id: opts.userId,
      },
    });
    if (error) throw new Error("Failed to store structured data");
    const storeResult = data as Record<string, unknown> | null;
    const entitiesList =
      storeResult && Array.isArray((storeResult as any).entities)
        ? ((storeResult as any).entities as any[])
        : [];
    const created = entitiesList
      .map((e) => ({ id: (e?.entity_id ?? e?.id) as string | undefined }))
      .filter((e) => typeof e.id === "string" && e.id.length > 0);
    if (storeResult) {
      writeOutput(
        {
          ...storeResult,
          entities_created_count: (storeResult as any).entities_created,
          entities_created: created,
        },
        outputMode
      );
    } else {
      writeOutput(data, outputMode);
    }
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

    const { data, error } = await api.POST("/store/unstructured", {
      body: {
        file_content: contentBase64,
        mime_type: mimeType,
        original_filename: originalFilename,
        interpret: shouldInterpret,
        idempotency_key: idempotencyKey,
        user_id: opts.userId,
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
  .action(
    async (
      filePath: string,
      opts: { interpret?: boolean; idempotencyKey?: string; mimeType?: string; local?: boolean }
    ) => {
      const outputMode = resolveOutputMode();

      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);
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

            const rawText = await extractTextFromBuffer(
              fileBuffer,
              mimeType,
              originalFilename || "file"
            );

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
              mimeType.toLowerCase().includes("pdf") ||
              originalFilename.toLowerCase().endsWith(".pdf");
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
              const imageDataUrl =
                typeof imageResult === "object" ? imageResult.dataUrl : imageResult;
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
                ? await extractFromCSVWithChunking(
                    rawText,
                    originalFilename || "file",
                    mimeType,
                    "gpt-4o"
                  )
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
                error:
                  interpretError instanceof Error ? interpretError.message : String(interpretError),
                skipped: true,
              };
            }
          }

          writeOutput(response, outputMode);
        } catch (localError) {
          const msg = localError instanceof Error ? localError.message : String(localError);
          throw new Error(`Local mode failed: ${msg}\nEnsure .env and DB path are configured.`);
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

      const { data, error } = await api.POST("/store/unstructured", { body });
      if (error) throw new Error("Failed to upload file");
      writeOutput(data, outputMode);
    }
  );

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
  .action(
    async (
      sourceIdArg: string | undefined,
      opts: {
        sourceId?: string;
        interpretationId?: string;
        interpretationConfig?: string;
        userId?: string;
      }
    ) => {
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

      if (!sourceId && !opts.interpretationId)
        throw new Error("source ID or --interpretation-id is required");

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
      writeOutput(
        {
          interpretation_id: result?.interpretation_id ?? opts.interpretationId,
          reinterpreted: result?.success ?? true,
          observations_created: result?.observations_created ?? 0,
        },
        outputMode
      );
    }
  );

interpretationsCommand
  .command("interpret-uninterpreted")
  .description("Interpret sources that do not yet have any interpretations")
  .option("--limit <n>", "Maximum uninterpreted sources to process", "50")
  .option("--dry-run", "Only list source IDs that would be interpreted")
  .option("--interpretation-config <json>", "Optional interpretation configuration JSON")
  .option("--user-id <userId>", "User ID")
  .action(
    async (opts: {
      limit?: string;
      dryRun?: boolean;
      interpretationConfig?: string;
      userId?: string;
    }) => {
      const outputMode = resolveOutputMode();
      const config = await readConfig();
      const token = await getCliToken();
      const api = createApiClient({
        baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
        token,
      });
      const parsedLimit = Number(opts.limit ?? "50");
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        throw new Error("--limit must be a positive number");
      }
      const interpretationConfig = opts.interpretationConfig
        ? JSON.parse(opts.interpretationConfig)
        : undefined;
      const { data, error } = await api.POST("/interpret-uninterpreted", {
        body: {
          limit: Math.trunc(parsedLimit),
          dry_run: Boolean(opts.dryRun),
          interpretation_config: interpretationConfig,
          user_id: opts.userId,
        } as any,
      });
      if (error) throw new Error("Failed to interpret uninterpreted sources");
      writeOutput(data, outputMode);
    }
  );

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
  .action(
    async (
      entityIdArg: string | undefined,
      opts: {
        entityId?: string;
        entityType?: string;
        fieldName?: string;
        correctedValue?: string;
        userId?: string;
        idempotencyKey?: string;
      }
    ) => {
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
      const idempotencyKey =
        opts.idempotencyKey ||
        createIdempotencyKey({ entityId, field: opts.fieldName, value: opts.correctedValue });
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
      writeOutput(
        { correction_id: correctionId, entity_id: entityId, success: result?.success ?? true },
        outputMode
      );
    }
  );

const statsCmd = program.command("stats").description("Dashboard and entity statistics");
statsCmd.action(async () => {
  const outputMode = resolveOutputMode();
  const config = await readConfig();
  const token = await getCliToken();
  const api = createApiClient({
    baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
    token,
  });
  const { data, error } = await api.GET("/stats", {});
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
    const { data, error } = await api.GET("/stats", {});
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

snapshotsCommand
  .command("request")
  .description("Request snapshot recomputation for stale snapshots")
  .option("--dry-run", "Check only, do not recompute stale snapshots", false)
  .action(async (opts: { dryRun?: boolean }) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await getCliToken();
    const api = createApiClient({
      baseUrl: await resolveBaseUrl(program.opts().baseUrl, config),
      token,
    });
    const { data, error } = await api.POST("/health_check_snapshots", {
      body: {
        auto_fix: !opts.dryRun,
      },
    });
    if (error) throw new Error("Failed to request snapshot recomputation");
    writeOutput(
      {
        requested: true,
        auto_fix: !opts.dryRun,
        ...(data as Record<string, unknown>),
      },
      outputMode
    );
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
async function _fetchStorageSummary(): Promise<string | null> {
  try {
    const config = await readConfig();
    const baseUrl = await resolveBaseUrl(program.opts().baseUrl, config);
    const token = await getCliToken();
    const api = createApiClient({ baseUrl, token });
    const { data, error } = await api.GET("/stats", {});
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
const INTRO_PACK_RAT_DISPLAY_WIDTH = Math.max(...INTRO_PACK_RAT_LINES.map((s) => displayWidth(s)));

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
      const [current, packageName] = await Promise.all([getCliVersion(), getPackageName()]);
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

/** Resolve data directory for local SQLite: NEOTOMA_DATA_DIR if set, else repoRoot/data. */
function resolveDataDir(repoRoot: string): string {
  const envDir = process.env.NEOTOMA_DATA_DIR?.trim();
  return envDir ? envDir : path.join(repoRoot, "data");
}

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
  total_observations: number;
  total_interpretations: number;
} | null> {
  if (!userId) return null;
  const dataDir = resolveDataDir(repoRoot);
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
    const relationships = getCount(
      "SELECT count(*) FROM relationship_snapshots WHERE user_id = ?",
      userId
    );
    const sources = getCount("SELECT count(*) FROM sources WHERE user_id = ?", userId);
    const events = getCount(
      "SELECT count(*) FROM timeline_events WHERE source_id IN (SELECT id FROM sources WHERE user_id = ?)",
      userId
    );
    let observations = 0;
    let interpretations = 0;
    try {
      observations = getCount("SELECT count(*) FROM observations WHERE user_id = ?", userId);
      interpretations = getCount(
        "SELECT count(*) FROM interpretations WHERE source_id IN (SELECT id FROM sources WHERE user_id = ?)",
        userId
      );
    } catch {
      // observations or interpretations table may not exist in older DBs
    }
    db.close();
    return {
      total_entities: entities,
      total_relationships: relationships,
      total_sources: sources,
      total_events: events,
      total_observations: observations,
      total_interpretations: interpretations,
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
  const dataDir = resolveDataDir(repoRoot);
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
    prepare: (sql: string) => {
      get: (...args: unknown[]) => Row | undefined;
      all: (...args: unknown[]) => Row[];
    };
  };
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath) as unknown as DbInstance;
  db.pragma("busy_timeout = 2000");
  try {
    const entity = db
      .prepare(
        "SELECT id, entity_type, canonical_name, merged_to_entity_id FROM entities WHERE id = ? AND user_id = ?"
      )
      .get(entityId, userId) as Row | undefined;
    if (!entity) return null;
    const resolvedId = (entity.merged_to_entity_id as string) || entityId;
    let snapshot: Record<string, unknown> | null = null;
    try {
      const snap = db
        .prepare("SELECT snapshot FROM entity_snapshots WHERE entity_id = ? AND user_id = ?")
        .get(resolvedId, userId) as { snapshot?: unknown } | undefined;
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

/**
 * Load source by id from local SQLite (same DB as Recent events). Used when API returns 404
 * so the user can still see source details from local DB.
 */
async function getSourceFromLocalDb(
  repoRoot: string,
  preferredEnv: "dev" | "prod",
  userId: string,
  sourceId: string
): Promise<Record<string, unknown> | null> {
  const dataDir = resolveDataDir(repoRoot);
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
    prepare: (sql: string) => { get: (...args: unknown[]) => Row | undefined };
  };
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath) as unknown as DbInstance;
  db.pragma("busy_timeout = 2000");
  try {
    const source = db
      .prepare("SELECT * FROM sources WHERE id = ? AND user_id = ?")
      .get(sourceId, userId) as Row | undefined;
    return source ?? null;
  } finally {
    db.close();
  }
}

/**
 * Load relationship by key from local SQLite (same DB as Recent events). Used when API lookup fails
 * so the user can still see relationship details from local DB.
 */
async function getRelationshipFromLocalDb(
  repoRoot: string,
  preferredEnv: "dev" | "prod",
  userId: string,
  relationshipKey: string
): Promise<Record<string, unknown> | null> {
  const dataDir = resolveDataDir(repoRoot);
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
    prepare: (sql: string) => { get: (...args: unknown[]) => Row | undefined };
  };
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath) as unknown as DbInstance;
  db.pragma("busy_timeout = 2000");
  try {
    const snapshot = db
      .prepare("SELECT * FROM relationship_snapshots WHERE relationship_key = ? AND user_id = ?")
      .get(relationshipKey, userId) as Row | undefined;
    if (snapshot) return snapshot;

    const lastObservation = db
      .prepare(
        "SELECT relationship_key, relationship_type, source_entity_id, target_entity_id, observed_at, created_at, source_id, interpretation_id, user_id FROM relationship_observations WHERE relationship_key = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(relationshipKey, userId) as Row | undefined;
    return lastObservation ?? null;
  } finally {
    db.close();
  }
}

const WATCH_INITIAL_EVENT_LIMIT = 10;

/**
 * Last N watch entries: sourced from the local SQLite DB (same tables the watch command polls).
 * Returns WatchEvent[] for display with formatWatchTable (Recent events box).
 * When tagEnv is set, each event is tagged with that env (for cross-env merged display).
 */
async function getLastNWatchEntries(
  repoRoot: string,
  preferredEnv: "dev" | "prod",
  userId: string | null,
  limit = 20,
  tagEnv?: "dev" | "prod"
): Promise<WatchEvent[]> {
  if (!userId) return [];
  const dataDir = resolveDataDir(repoRoot);
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
      const entityRows = db
        .prepare(
          `SELECT id, entity_type, canonical_name FROM entities WHERE id IN (${ph}) AND user_id = ?`
        )
        .all(...entityIds, userId) as { id: string; entity_type: string; canonical_name: string }[];
      for (const r of entityRows) {
        entityMeta.set(r.id, { entity_type: r.entity_type, canonical_name: r.canonical_name });
      }
      try {
        const snapshotRows = db
          .prepare(
            `SELECT entity_id, snapshot FROM entity_snapshots WHERE entity_id IN (${ph}) AND user_id = ?`
          )
          .all(...entityIds, userId) as { entity_id: string; snapshot: unknown }[];
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
      if (table === "entity_snapshots")
        return (str("entity_type") || meta(str("entity_id"))) ?? "-";
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
        ...(tagEnv ? { env: tagEnv } : {}),
      };
      if (table === "observations" || table === "entity_snapshots" || table === "raw_fragments") {
        out.entity_id = strVal(row, "entity_id");
      } else if (table === "relationship_observations" || table === "relationship_snapshots") {
        out.relationship_key =
          strVal(row, "relationship_key") ?? (table === "relationship_snapshots" ? id : undefined);
        out.relationship_type = strVal(row, "relationship_type");
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

/**
 * Last N watch entries across dev and prod local DBs (no API). Merges and sorts by ts descending, returns top N.
 * Use when showing "Recent events" from both environments (e.g. watch --env all).
 */
async function getLastNWatchEntriesAcrossEnvs(
  repoRoot: string,
  userId: string | null,
  limit = 20
): Promise<WatchEvent[]> {
  if (!userId) return [];
  const perEnv = Math.ceil(limit * 1.5);
  const [devEvents, prodEvents] = await Promise.all([
    getLastNWatchEntries(repoRoot, "dev", userId, perEnv, "dev"),
    getLastNWatchEntries(repoRoot, "prod", userId, perEnv, "prod"),
  ]);
  const merged = [...devEvents, ...prodEvents]
    .sort((a, b) => (b.ts < a.ts ? -1 : b.ts > a.ts ? 1 : 0))
    .slice(0, limit)
    .reverse();
  return merged;
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
    const { data, error } = await api.GET("/stats", {});
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

type IntroStats = {
  total_entities: number;
  total_relationships: number;
  total_sources: number;
  total_events: number;
  total_observations: number;
  total_interpretations: number;
};

/** Prod and dev intro stats for dual-column intro box. */
export type DualEnvIntroStats = { prod: IntroStats | null; dev: IntroStats | null };

async function getDualEnvIntroStats(
  repoRoot: string,
  userId: string | null
): Promise<DualEnvIntroStats> {
  const effectiveUserId = userId ?? LOCAL_DEV_USER_ID;
  const [prod, dev] = await Promise.all([
    getLocalIntroStats(repoRoot, "prod", effectiveUserId),
    getLocalIntroStats(repoRoot, "dev", effectiveUserId),
  ]);
  return { prod, dev };
}

export function buildApiBoxLines(instances: ApiInstance[], mcpStdioCount?: number): string[] {
  if (instances.length === 0) {
    const lines: string[] = ["No running Neotoma HTTP APIs detected (ports 8080, 8180)."];
    if (mcpStdioCount !== undefined && mcpStdioCount > 0) {
      lines.push(`Neotoma MCP (stdio): ${mcpStdioCount} process(es) running (e.g. Cursor).`);
    } else {
      lines.push("MCP servers run by Cursor use stdio and are detected separately when running.");
    }
    return lines;
  }
  const envRank = (envHint: ApiInstance["envHint"]): number => {
    if (envHint === "prod") return 0;
    if (envHint === "dev") return 1;
    return 2;
  };
  const sorted = [...instances].sort((a, b) => {
    const rank = envRank(a.envHint) - envRank(b.envHint);
    if (rank !== 0) return rank;
    return a.port - b.port;
  });
  return sorted.map((instance) => {
    const envLabel =
      instance.envHint === "prod"
        ? "Production API"
        : instance.envHint === "dev"
          ? "Development API"
          : "Custom API";
    return `${envLabel}: ${instance.url} (${instance.latencyMs} ms)`;
  });
}

type CliInstructionScanSummary = {
  appliedProject: { cursor: boolean; claude: boolean; codex: boolean };
  appliedUser: { cursor: boolean; claude: boolean; codex: boolean };
};

const INIT_TABLE_PLATFORMS = ["Claude", "Codex", "Cursor"] as const;
type InitPlatform = (typeof INIT_TABLE_PLATFORMS)[number];

function getMcpStatusByPlatform(
  mcpConfigs: McpConfigStatus[],
  repoRoot: string | null
): Record<InitPlatform, { mcpUser: boolean; mcpProject: boolean }> {
  const result: Record<InitPlatform, { mcpUser: boolean; mcpProject: boolean }> = {
    Claude: { mcpUser: false, mcpProject: false },
    Codex: { mcpUser: false, mcpProject: false },
    Cursor: { mcpUser: false, mcpProject: false },
  };

  const isProjectPath = (configPath: string): boolean => {
    if (!repoRoot) return false;
    const rel = path.relative(repoRoot, configPath);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };

  const platformForPath = (configPath: string): InitPlatform | null => {
    const lower = configPath.toLowerCase();
    if (lower.includes("claude")) return "Claude";
    if (lower.includes(".codex")) return "Codex";
    if (lower.includes(".cursor")) return "Cursor";
    return null;
  };

  for (const config of mcpConfigs) {
    if (!config.hasDev && !config.hasProd) continue;
    const platform = platformForPath(config.path);
    if (!platform) continue;
    if (isProjectPath(config.path)) result[platform].mcpProject = true;
    else result[platform].mcpUser = true;
  }

  return result;
}

export type InitContextStatus = {
  dataDirExists: boolean;
  envFileExists: boolean;
  dataDir: string;
  envFilePath: string;
};

/** Resolve data dir and .env status for init box. Returns null when repo root is unknown. */
export async function getInitContextStatus(
  repoRoot: string | null
): Promise<InitContextStatus | null> {
  if (!repoRoot) return null;
  const envPath = path.join(repoRoot, ".env");
  const envFileExists = await pathExists(envPath);
  let dataDir: string;
  if (envFileExists) {
    const envVars = await readEnvFileVars(envPath);
    const configured = envVars.NEOTOMA_DATA_DIR?.trim();
    dataDir = configured
      ? path.isAbsolute(configured)
        ? configured
        : path.resolve(repoRoot, configured)
      : path.join(repoRoot, "data");
  } else {
    dataDir = path.join(repoRoot, "data");
  }
  const dataDirExists = await pathExists(dataDir);
  return { dataDirExists, envFileExists, dataDir, envFilePath: envPath };
}

export function buildInstallationBoxLines(
  mcpConfigs: McpConfigStatus[],
  cliScan: CliInstructionScanSummary | null,
  initContext?: InitContextStatus | null,
  repoRoot?: string | null
): string[] {
  const mark = (ok: boolean): string => (ok ? "✅" : "❌");
  const hasPath = (value: string): boolean =>
    mcpConfigs.some((config) => config.path.toLowerCase().includes(value));
  const hasAnyMcpForPlatform = (value: string): boolean =>
    mcpConfigs.some(
      (config) => config.path.toLowerCase().includes(value) && (config.hasDev || config.hasProd)
    );

  const lines: string[] = [""];

  if (initContext != null) {
    lines.push(
      "Data directory  " + mark(initContext.dataDirExists) + "  " + (initContext.dataDir ?? "")
    );
    lines.push(
      ".env file       " + mark(initContext.envFileExists) + "  " + (initContext.envFilePath ?? "")
    );
    lines.push("");
  }

  const mcpByPlatform = getMcpStatusByPlatform(mcpConfigs, repoRoot ?? null);
  const cliByPlatform: Record<InitPlatform, boolean> =
    cliScan == null
      ? { Claude: false, Codex: false, Cursor: false }
      : {
          Claude: cliScan.appliedProject.claude || cliScan.appliedUser.claude,
          Codex: cliScan.appliedProject.codex || cliScan.appliedUser.codex,
          Cursor: cliScan.appliedProject.cursor || cliScan.appliedUser.cursor,
        };

  const colConfig = "Config";
  const colMcpUser = "MCP User";
  const colMcpProject = "MCP Project";
  const colCli = "CLI Instructions";
  const wConfig = Math.max(colConfig.length, ...INIT_TABLE_PLATFORMS.map((s) => s.length));
  const wMcpUser = Math.max(colMcpUser.length, 2);
  const wMcpProject = Math.max(colMcpProject.length, 2);
  const wCli = Math.max(colCli.length, 2);
  const pad = (s: string, w: number) => s.padEnd(w);
  lines.push(
    pad(colConfig, wConfig) +
      "  " +
      pad(colMcpUser, wMcpUser) +
      "  " +
      pad(colMcpProject, wMcpProject) +
      "  " +
      colCli
  );
  lines.push("-".repeat(wConfig + 2 + wMcpUser + 2 + wMcpProject + 2 + wCli));
  for (const platform of INIT_TABLE_PLATFORMS) {
    const mcp = mcpByPlatform[platform];
    const cli =
      cliScan != null &&
      hasPath(platform === "Cursor" ? ".cursor" : platform === "Claude" ? "claude" : ".codex")
        ? cliByPlatform[platform]
        : true;
    lines.push(
      pad(platform, wConfig) +
        "  " +
        pad(mark(mcp.mcpUser), wMcpUser) +
        "  " +
        pad(mark(mcp.mcpProject), wMcpProject) +
        "  " +
        mark(cli)
    );
  }

  let cliMissing = false;
  if (cliScan != null) {
    if (!cliScan.appliedProject.cursor && !cliScan.appliedUser.cursor && hasPath(".cursor")) {
      cliMissing = true;
    }
    if (!cliScan.appliedProject.claude && !cliScan.appliedUser.claude && hasPath("claude")) {
      cliMissing = true;
    }
    if (!cliScan.appliedProject.codex && !cliScan.appliedUser.codex && hasPath(".codex")) {
      cliMissing = true;
    }
  }
  const anyMcpMissing =
    (hasPath(".cursor") && !hasAnyMcpForPlatform(".cursor")) ||
    (hasPath("claude") && !hasAnyMcpForPlatform("claude")) ||
    (hasPath(".codex") && !hasAnyMcpForPlatform(".codex"));
  if (cliMissing || anyMcpMissing) {
    lines.push("");
    lines.push("To complete setup: neotoma init");
  }
  return lines;
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
async function runInitWithStatus(options?: { deferApiStats?: boolean }): Promise<{
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

const INTRO_STAT_LABEL_WIDTH = 18;
const INTRO_STAT_VALUE_WIDTH = 10;

function formatIntroStatValue(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function buildIntroBoxContent(
  version: string,
  summaryLinesOrStats: string[] | DualEnvIntroStats,
  _env?: "dev" | "prod"
): IntroBoxContent {
  const versionPart = dim(`v${version}`);
  const title = black(bold(" Neotoma ") + versionPart + " ");
  const ratW = INTRO_PACK_RAT_DISPLAY_WIDTH;
  const ratSep = "  " + black("│") + " ";
  const blankRat = padToDisplayWidth("", ratW) + ratSep;

  const isStats = (x: string[] | DualEnvIntroStats): x is DualEnvIntroStats =>
    typeof x === "object" && x !== null && "prod" in x && "dev" in x;

  if (isStats(summaryLinesOrStats)) {
    const { prod, dev } = summaryLinesOrStats;
    const pad = (s: string, w: number) => padToDisplayWidth(s, w);
    const rows: [string, number | null, number | null][] = [
      ["entities", prod?.total_entities ?? null, dev?.total_entities ?? null],
      ["relationships", prod?.total_relationships ?? null, dev?.total_relationships ?? null],
      ["sources", prod?.total_sources ?? null, dev?.total_sources ?? null],
      ["timeline events", prod?.total_events ?? null, dev?.total_events ?? null],
      ["observations", prod?.total_observations ?? null, dev?.total_observations ?? null],
      ["interpretations", prod?.total_interpretations ?? null, dev?.total_interpretations ?? null],
    ];
    const headerLine =
      blankRat +
      bold(pad("Record type", INTRO_STAT_LABEL_WIDTH)) +
      WATCH_TABLE_GAP +
      bold(pad("Prod", INTRO_STAT_VALUE_WIDTH)) +
      WATCH_TABLE_GAP +
      bold(pad("Dev", INTRO_STAT_VALUE_WIDTH));
    const ratLines = [
      padToDisplayWidth(INTRO_PACK_RAT_LINES[0], ratW) + ratSep,
      padToDisplayWidth(INTRO_PACK_RAT_LINES[1], ratW) + ratSep,
      padToDisplayWidth(INTRO_PACK_RAT_LINES[2], ratW) + ratSep,
    ];
    const dataLines = rows.map(([label, pVal, dVal], i) => {
      const rat = i < ratLines.length ? ratLines[i]! : blankRat;
      const labelPart = dim(pad(label, INTRO_STAT_LABEL_WIDTH));
      const prodPart = dim(pad(formatIntroStatValue(pVal), INTRO_STAT_VALUE_WIDTH));
      const devPart = dim(pad(formatIntroStatValue(dVal), INTRO_STAT_VALUE_WIDTH));
      return rat + labelPart + WATCH_TABLE_GAP + prodPart + WATCH_TABLE_GAP + devPart;
    });
    const contentLines: string[] = [blankRat, headerLine, ...dataLines];
    const withInnerPadding = [...contentLines, blankRat];
    return { lines: withInnerPadding, title };
  }

  const normalizedSummary =
    summaryLinesOrStats.length > 0
      ? summaryLinesOrStats
      : ["Production data: unavailable", "Development data: unavailable"];
  const contentLines: string[] = [
    blankRat,
    padToDisplayWidth(INTRO_PACK_RAT_LINES[0], ratW) + ratSep,
    padToDisplayWidth(INTRO_PACK_RAT_LINES[1], ratW) + ratSep,
    padToDisplayWidth(INTRO_PACK_RAT_LINES[2], ratW) + ratSep,
    ...normalizedSummary.map((line) => blankRat + dim(line)),
  ];
  const withInnerPadding = [...contentLines, blankRat];
  return { lines: withInnerPadding, title };
}

type McpConfigStatus = { path: string; hasDev: boolean; hasProd: boolean };
const MAX_SESSION_BOX_WIDTH = 72;

function getSessionBoxWidth(rawWidth: number): number {
  return Math.max(20, Math.min(rawWidth, getTerminalWidth(), MAX_SESSION_BOX_WIDTH));
}

/**
 * Build the status block string (intro + optional watch + optional MCP) for redraw on SIGWINCH.
 * Returns output and line count so we know how many lines to clear before redraw.
 */
export function buildStatusBlockOutput(
  opts: {
    introContent: IntroBoxContent;
    apiLines?: string[];
    watchLines?: string[];
    watchEventCount?: number;
    installationLines?: string[];
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
  if (opts.apiLines != null && opts.apiLines.length > 0) {
    parts.push(
      "\n" +
        blackBox(opts.apiLines, {
          title: " APIs ",
          borderColor: "cyan",
          padding: 1,
          sessionBoxWidth,
        }) +
        "\n"
    );
  }
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
        dim("  View details: enter row number (1–" + opts.watchEventCount + ") at the prompt.") +
          "\n\n"
      );
    }
  }
  if (opts.installationLines != null && opts.installationLines.length > 0) {
    parts.push(
      "\n" +
        blackBox(opts.installationLines, {
          title: " Initialization ",
          borderColor: "cyan",
          padding: 1,
          sessionBoxWidth,
        }) +
        "\n"
    );
  }
  const output = parts.join("");
  const lineCount = output.split("\n").length;
  return { output, lineCount };
}

async function printIntroBlock(
  version: string,
  summaryLines: string[],
  env?: "dev" | "prod",
  options?: {
    sessionBoxWidth?: number;
    contentLines?: string[];
    title?: string;
  }
): Promise<void> {
  const { lines: withInnerPadding, title } =
    options?.contentLines != null && options?.title != null
      ? { lines: options.contentLines, title: options.title }
      : buildIntroBoxContent(version, summaryLines, env);
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

  if (process.stdout.isTTY) {
    const pad = 2;
    const ratW = INTRO_PACK_RAT_DISPLAY_WIDTH;
    const ratSep = "  " + black("│") + " ";
    const rawContentWidth = Math.max(0, ...withInnerPadding.map((l) => displayWidth(l)));
    const contentWidth = rawContentWidth + 2 * pad;
    const titleLen = visibleLength(title);
    const innerWidth =
      options?.sessionBoxWidth ?? Math.max(contentWidth, titleLen + 2, INTRO_MIN_WIDTH + 2 * pad);
    const faceContentOpen = padToDisplayWidth(INTRO_PACK_RAT_LINES[1], ratW) + ratSep;
    const faceContentWink = padToDisplayWidth(INTRO_PACK_RAT_FACE_WINK, ratW) + ratSep;
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
    // Face (•ㅅ•) is the second data row (index 3): blank, header, row0, row1=face. So output line 4 (0=top border).
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
      const cb =
        typeof callback === "function" ? (callback as (err?: Error | null) => void) : undefined;
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
      const cb =
        typeof callback === "function" ? (callback as (err?: Error | null) => void) : undefined;
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
  const isResetCommand = argv.includes("reset");
  const isInitCommand = argv.includes("init");
  const defaultLogPath =
    isProd || isResetCommand || isInitCommand
      ? null
      : repoRootForLog
        ? path.join(repoRootForLog, "data", "logs", cliLogBasename)
        : path.join(CONFIG_DIR, cliLogBasename);
  const logFilePath = noLogFile ? null : (explicitLogPath ?? defaultLogPath);
  if (logFilePath) {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true }).catch(() => {});
    teeToLogFile(logFilePath);
  }

  let version: string | null = null;

  program.parseOptions(argv);
  const args = program.args && program.args.length > 0 ? program.args : argv.slice(2);
  const noSession = argv.includes("--no-session");
  const noServers = argv.includes("--no-servers");
  const serversOpt = (program.opts() as { servers?: string }).servers;
  const tunnel = argv.includes("--tunnel");
  const noArgs = hasNoCommand(args);

  // `neotoma --help` and `neotoma --version` must never enter interactive/session mode.
  // This is required for scripting and piping (e.g. `neotoma --help | head`).
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const wantsVersion = argv.includes("--version") || argv.includes("-V");
  if (noArgs && (wantsHelp || wantsVersion)) {
    if (wantsVersion) {
      const v = await getCliVersion();
      process.stdout.write(v + "\n");
      return;
    }
    program.outputHelp();
    return;
  }

  if (!isResetCommand && !isInitCommand) {
    runUpdateNotifier();
  }

  const serverPolicy =
    noArgs && !noSession ? await resolveServerPolicy(noServers, serversOpt) : null;
  const startServers = serverPolicy === "start";
  const deferApiStats = serverPolicy === "start" || serverPolicy === "use-existing";

  // Apply --env early so resolveBaseUrl and use-existing logic respect it for both session and direct commands.
  const envOpt = (program.opts() as { env?: string }).env;
  if (envOpt === "dev" || envOpt === "prod") {
    process.env.NEOTOMA_SESSION_ENV = envOpt;
  }

  if (process.stdout.isTTY && !isResetCommand && !isInitCommand) {
    const cleanupCancel = installInitCancelListener(() => process.exit(0));
    try {
      const init = await runInitWithStatus({ deferApiStats });
      version = init.version;
    } finally {
      cleanupCancel();
    }
  } else if (!isResetCommand && !isInitCommand) {
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
    if (noSession) {
      debugLog("No-session mode: showing intro panel and command menu (no REPL)");
      const v = version ?? (await getCliVersion());
      const repoRootForLocal = await findRepoRoot(process.cwd());
      const introStatsOrFallback = repoRootForLocal
        ? await getDualEnvIntroStats(repoRootForLocal, LOCAL_DEV_USER_ID)
        : ["Production data: unavailable", "Development data: unavailable"];
      const recentEvents = repoRootForLocal
        ? await getLastNWatchEntriesAcrossEnvs(
            repoRootForLocal,
            LOCAL_DEV_USER_ID,
            WATCH_INITIAL_EVENT_LIMIT
          )
        : [];
      const watchLines =
        recentEvents.length > 0 ? formatWatchTable(recentEvents, new Date()) : undefined;
      const introContent = buildIntroBoxContent(v, introStatsOrFallback, undefined);
      const mcpStdioCount = await detectNeotomaMcpStdioProcessCount();
      const apiLines = buildApiBoxLines([], mcpStdioCount);
      const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
      const { scanAgentInstructions } = await import("./agent_instructions_scan.js");
      const { configs: mcpConfigs } = await scanForMcpConfigs(process.cwd(), {
        includeUserLevel: true,
        userLevelFirst: true,
        neotomaRepoRoot: repoRootForLocal,
      });
      const agentScan = await scanAgentInstructions(repoRootForLocal ?? process.cwd(), {
        includeUserLevel: true,
      });
      const initContext = await getInitContextStatus(repoRootForLocal ?? null);
      const installationLines = buildInstallationBoxLines(
        mcpConfigs,
        agentScan,
        initContext,
        repoRootForLocal ?? null
      );
      const rawSessionBoxWidth = Math.max(
        computeBoxInnerWidth(introContent.lines, { title: introContent.title, padding: 2 }),
        computeBoxInnerWidth(apiLines, { title: " APIs ", padding: 1 }),
        watchLines != null
          ? computeBoxInnerWidth(watchLines, { title: " Recent events ", padding: 1 })
          : 0,
        computeBoxInnerWidth(installationLines, { title: " Initialization ", padding: 1 })
      );
      const sessionBoxWidth = getSessionBoxWidth(rawSessionBoxWidth);
      const { output } = buildStatusBlockOutput(
        {
          introContent,
          apiLines,
          watchLines,
          watchEventCount: recentEvents.length > 0 ? recentEvents.length : undefined,
          installationLines,
        },
        sessionBoxWidth
      );
      process.stdout.write(output);
      await runCommandMenuLoop();
      return;
    }

    if (isDebug()) {
      process.stderr.write(
        dim(`[debug] Server policy: ${serverPolicy}, startServers: ${startServers}\n`)
      );
    }
    let devChild: ReturnType<typeof spawn> | null = null;
    let prodChild: ReturnType<typeof spawn> | null = null;
    let sessionRepoRoot: string | undefined;
    /** When this run started the server, path to that run's session log (session.<pid>.log). */
    let currentSessionLogPath: string | undefined;
    /** User ID from /me, used for watch events and local-DB fallback in session. */
    let userIdForWatch: string | null = null;
    let storedSessionBoxWidth: number | undefined;
    let storedStatusBlockRedrawData: {
      introContent: IntroBoxContent;
      apiLines: string[];
      watchLines?: string[];
      watchEventCount?: number;
      installationLines: string[];
      /** Content-driven max width (before terminal cap). Redraw uses min(this, getTerminalWidth()) so boxes resize with viewport. */
      rawSessionBoxWidth: number;
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
        process.stderr.write("neotoma: no environment specified. Use --env dev or --env prod.\n");
        process.exit(1);
        preferredEnv = "dev"; // unreachable; satisfy TypeScript
      }
    } else {
      // use-existing: env is determined later when connecting to a running server
      preferredEnv = "dev"; // temporary; overridden below
    }
    process.env.NEOTOMA_SESSION_ENV = preferredEnv;

    if (!startServers) {
      const repoResult = await loadNpmScripts().catch(() => null);
      if (repoResult) {
        sessionRepoRoot = repoResult.repoRoot;
      }
    }

    if (startServers) {
      const initReadyRepo = await maybeRunInitForMissingRepo(process.stdout.isTTY);
      if (!initReadyRepo) {
        process.stderr.write(INIT_REQUIRED_MESSAGE + "\n");
        process.exitCode = 1;
        return;
      }
      debugLog("Loading project (package.json, npm scripts)…");
      const loadRepo = (): Promise<{ repoRoot: string; scripts: NpmScript[] } | null> =>
        loadNpmScripts().catch(() => null);
      const repoResult = process.stdout.isTTY
        ? await runWithSpinner("Loading project…", loadRepo)
        : await loadRepo();
      if (repoResult) {
        debugLog(`Repo root: ${repoResult.repoRoot}`);
      }
      if (!repoResult) {
        process.stderr.write(INIT_REQUIRED_MESSAGE + "\n");
        process.exitCode = 1;
        return;
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
          const sessionLogBasename = preferredEnv === "prod" ? "session.prod.log" : "session.log";
          const sessionLogPath = path.join(sessionLogDir, sessionLogBasename);
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
            NEOTOMA_HTTP_PORT: String(devPort),
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
            NEOTOMA_HTTP_PORT: String(prodPort),
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
          debugLog("Health ok; waiting for API to serve /me (timeout 20s, interval 500ms)");
          ready = process.stdout.isTTY
            ? await runWithSpinner(`Waiting for API (${result.env})…`, () =>
                waitForApiReady(actualPort, { timeoutMs: 20000, intervalMs: 500 })
              )
            : await waitForApiReady(actualPort, { timeoutMs: 20000, intervalMs: 500 });
        }
        debugLog(
          ready
            ? "Server and API ready (health + /me responded)"
            : "Server did not become ready in time"
        );
        if (!ready) {
          process.stderr.write(
            warn("Server did not become ready in time. Commands may fail until it is up.\n")
          );
          const sessionLogBasename = result.env === "prod" ? "session.prod.log" : "session.log";
          const sessionLogPath =
            currentSessionLogPath ?? path.join(sessionRepoRoot, "data", "logs", sessionLogBasename);
          const logTail = await readLastLines(sessionLogPath, 40);
          if (logTail) {
            process.stderr.write("\n" + subHeading("Server output") + "\n");
            process.stderr.write(dim(logTail) + "\n\n");
          }
          process.stderr.write(dim("Full log: ") + pathStyle(sessionLogPath) + "\n");
        } else if (version != null) {
          debugLog("Fetching intro stats (entities, relationships, sources)…");
          await fetchIntroStats(String(actualPort));
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
        try {
          debugLog("Resolving CLI token for /me…");
          const token = await getCliToken();
          const meHeaders: Record<string, string> = {};
          if (token) meHeaders.Authorization = `Bearer ${token}`;
          debugLog(`Fetching http://127.0.0.1:${actualPort}/me`);
          const meRes = await fetch(`http://127.0.0.1:${actualPort}/me`, {
            headers: meHeaders,
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as { user_id?: string };
            if (me.user_id) {
              debugLog(`User id: ${me.user_id}`);
              userIdForWatch = me.user_id;
            } else {
              debugLog("API /me ok but no user_id in response");
            }
          } else if (meRes.status === 401) {
            debugLog("API /me returned 401 (not signed in)");
          } else {
            debugLog(`API /me returned ${meRes.status}`);
          }
        } catch (err) {
          const reason =
            err instanceof Error && (err.message.includes("token") || err.message.includes("auth"))
              ? "no auth"
              : "API unreachable";
          debugLog(`User id failed: ${err instanceof Error ? err.message : String(err)}`);
          debugLog(`User fallback reason: ${reason}`);
        }
        if (sessionRepoRoot) {
          const effectiveUserId = userIdForWatch ?? LOCAL_DEV_USER_ID;
          const introStats = await getDualEnvIntroStats(sessionRepoRoot, effectiveUserId);
          const recentEvents = await getLastNWatchEntriesAcrossEnvs(
            sessionRepoRoot,
            effectiveUserId,
            WATCH_INITIAL_EVENT_LIMIT
          );
          lastShownWatchEvents = recentEvents.length > 0 ? recentEvents : null;
          const watchLines =
            recentEvents.length > 0 ? formatWatchTable(recentEvents, new Date()) : undefined;
          if (watchLines != null && recentEvents.length > 0) {
            sessionWatchDisplayRef = { watchLines, watchEventCount: recentEvents.length };
          } else {
            sessionWatchDisplayRef = null;
          }

          const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
          const { scanAgentInstructions } = await import("./agent_instructions_scan.js");
          const devPortEnv = process.env.NEOTOMA_SESSION_DEV_PORT;
          const prodPortEnv = process.env.NEOTOMA_SESSION_PROD_PORT;
          const devPort =
            devPortEnv && /^\d+$/.test(devPortEnv) ? parseInt(devPortEnv, 10) : undefined;
          const prodPort =
            prodPortEnv && /^\d+$/.test(prodPortEnv) ? parseInt(prodPortEnv, 10) : undefined;
          const activePortEnv = process.env.NEOTOMA_SESSION_API_PORT;
          const activePort =
            activePortEnv && /^\d+$/.test(activePortEnv) ? parseInt(activePortEnv, 10) : undefined;
          const { configs: mcpConfigs } = await scanForMcpConfigs(process.cwd(), {
            includeUserLevel: true,
            userLevelFirst: true,
            devPort,
            prodPort,
            activePort,
            activeEnv: preferredEnv,
            neotomaRepoRoot: sessionRepoRoot,
          });
          const configured = await readConfig();
          const discoveredInstances = await discoverApiInstances({ config: configured });
          const mcpStdioCount = await detectNeotomaMcpStdioProcessCount();
          const apiLines = buildApiBoxLines(discoveredInstances, mcpStdioCount);
          const agentScan = await scanAgentInstructions(sessionRepoRoot, {
            includeUserLevel: true,
          });
          const initContext = await getInitContextStatus(sessionRepoRoot ?? null);
          const installationLines = buildInstallationBoxLines(
            mcpConfigs,
            agentScan,
            initContext,
            sessionRepoRoot ?? null
          );
          const currentVersion = version ?? (await getCliVersion());
          const introContent = buildIntroBoxContent(currentVersion, introStats, result.env);
          const rawSessionBoxWidth = Math.max(
            computeBoxInnerWidth(introContent.lines, {
              title: introContent.title,
              padding: 2,
            }),
            computeBoxInnerWidth(apiLines, { title: " APIs ", padding: 1 }),
            watchLines != null
              ? computeBoxInnerWidth(watchLines, { title: " Recent events ", padding: 1 })
              : 0,
            computeBoxInnerWidth(installationLines, { title: " Initialization ", padding: 1 })
          );
          const sessionBoxWidth = getSessionBoxWidth(rawSessionBoxWidth);
          const { output } = buildStatusBlockOutput(
            {
              introContent,
              apiLines,
              watchLines,
              watchEventCount: recentEvents.length > 0 ? recentEvents.length : undefined,
              installationLines,
            },
            sessionBoxWidth
          );
          process.stdout.write(output);
          storedSessionBoxWidth = sessionBoxWidth;
          storedStatusBlockRedrawData = {
            introContent,
            apiLines,
            watchLines,
            watchEventCount: recentEvents.length > 0 ? recentEvents.length : undefined,
            installationLines,
            rawSessionBoxWidth,
          };
        } else if (version != null) {
          const introContent = buildIntroBoxContent(
            version,
            ["Production data: unavailable", "Development data: unavailable"],
            undefined
          );
          await printIntroBlock(version, [], result.env, {
            contentLines: introContent.lines,
            title: introContent.title,
          });
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
        if (version != null) {
          const introContent = buildIntroBoxContent(
            version,
            ["Production data: unavailable", "Development data: unavailable"],
            undefined
          );
          await printIntroBlock(version, [], preferredEnv, {
            contentLines: introContent.lines,
            title: introContent.title,
          });
        }
        process.stdout.write(
          dim("Not in a Neotoma repo. Session only, servers are not started.") + "\n\n"
        );
      }
    } else {
      debugLog("Use-existing: probing for running API instances");
      const configured = await readConfig();
      const discoveredInstances = await discoverApiInstances({ config: configured });
      if (discoveredInstances.length === 0) {
        const version = await getCliVersion();
        const mcpStdioCount = await detectNeotomaMcpStdioProcessCount();
        const apiLines = buildApiBoxLines(discoveredInstances, mcpStdioCount);
        const repoRootForLocal = await findRepoRoot(process.cwd());
        const introStatsOrFallback = repoRootForLocal
          ? await getDualEnvIntroStats(repoRootForLocal, LOCAL_DEV_USER_ID)
          : ["Production data: unavailable", "Development data: unavailable"];
        const recentEvents = repoRootForLocal
          ? await getLastNWatchEntriesAcrossEnvs(
              repoRootForLocal,
              LOCAL_DEV_USER_ID,
              WATCH_INITIAL_EVENT_LIMIT
            )
          : [];
        lastShownWatchEvents = recentEvents.length > 0 ? recentEvents : null;
        const watchLines =
          recentEvents.length > 0 ? formatWatchTable(recentEvents, new Date()) : undefined;
        sessionWatchDisplayRef =
          watchLines != null && recentEvents.length > 0
            ? { watchLines, watchEventCount: recentEvents.length }
            : null;
        const introContent = buildIntroBoxContent(version, introStatsOrFallback, undefined);
        const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
        const { scanAgentInstructions } = await import("./agent_instructions_scan.js");
        const { configs: mcpConfigs } = await scanForMcpConfigs(process.cwd(), {
          includeUserLevel: true,
          userLevelFirst: true,
          neotomaRepoRoot: repoRootForLocal,
        });
        const agentScan = await scanAgentInstructions(repoRootForLocal ?? process.cwd(), {
          includeUserLevel: true,
        });
        const initContext = await getInitContextStatus(repoRootForLocal ?? null);
        const installationLines = buildInstallationBoxLines(
          mcpConfigs,
          agentScan,
          initContext,
          repoRootForLocal ?? null
        );
        const rawSessionBoxWidth = Math.max(
          computeBoxInnerWidth(introContent.lines, { title: introContent.title, padding: 2 }),
          computeBoxInnerWidth(apiLines, { title: " APIs ", padding: 1 }),
          watchLines != null
            ? computeBoxInnerWidth(watchLines, { title: " Recent events ", padding: 1 })
            : 0,
            computeBoxInnerWidth(installationLines, { title: " Initialization ", padding: 1 })
        );
        const sessionBoxWidth = getSessionBoxWidth(rawSessionBoxWidth);
        const { output } = buildStatusBlockOutput(
          {
            introContent,
            apiLines,
            watchLines,
            watchEventCount: getWatchEventCount(recentEvents),
            installationLines,
          },
          sessionBoxWidth
        );
        process.stdout.write(output);
        storedSessionBoxWidth = sessionBoxWidth;
        storedStatusBlockRedrawData = {
          introContent,
          apiLines,
          watchLines,
          watchEventCount: getWatchEventCount(recentEvents),
          installationLines,
          rawSessionBoxWidth,
        };
        const suggestionLinesRef = { current: 0 };
        const lastReadyPhraseRef = { current: SESSION_READY_PHRASES[0]! };
        const lastDetailOutputRef = { current: null as string | null };
        const data = storedStatusBlockRedrawData;
        const redrawStatusBlock: RedrawStatusBlockFn = () => {
          const newWidth = getSessionBoxWidth(data.rawSessionBoxWidth);
          const { output: redrawOutput } = buildStatusBlockOutput(data, newWidth);
          process.stdout.write(redrawOutput);
        };
        const { lineCount: statusBlockLineCount } = buildStatusBlockOutput(
          storedStatusBlockRedrawData,
          storedSessionBoxWidth ?? getTerminalWidth()
        );
        await runSessionLoop({
          onExit: () => {},
          repoRoot: repoRootForLocal ?? undefined,
          preferredEnv: "dev",
          userId: LOCAL_DEV_USER_ID,
          redrawStatusBlock,
          statusBlockLineCount,
          suggestionLinesRef,
          lastReadyPhraseRef,
          lastDetailOutputRef,
        });
        return;
      }
      const preferredEnvFromFlag = (program.opts() as { env?: string }).env;
      const envPreference: "dev" | "prod" | null =
        preferredEnvFromFlag === "dev" || preferredEnvFromFlag === "prod"
          ? preferredEnvFromFlag
          : null;

      let candidates = discoveredInstances;
      if (envPreference != null) {
        const envMatched = discoveredInstances.filter(
          (instance) => instance.envHint === envPreference
        );
        if (envMatched.length > 0) candidates = envMatched;
      }

      let selectedInstance: ApiInstance;
      if (candidates.length === 1) {
        selectedInstance = candidates[0]!;
      } else {
        process.stdout.write("\n" + bold("Which instance?") + "\n");
        candidates.forEach((instance, i) => {
          const label = instance.envHint === "unknown" ? "custom" : instance.envHint;
          process.stdout.write(
            dim(`  ${i + 1}) `) +
              pathStyle(`127.0.0.1:${instance.port}`) +
              dim(` (${label}, ${instance.latencyMs} ms)\n`)
          );
        });
        const which = await askQuestion(dim(`  [1-${candidates.length}] > `));
        const idx = parseInt(which.trim(), 10);
        const oneBased = Number.isFinite(idx) && idx >= 1 && idx <= candidates.length ? idx - 1 : 0;
        selectedInstance = candidates[oneBased]!;
      }

      const preferredPort = selectedInstance.port;
      process.env.NEOTOMA_SESSION_API_PORT = String(preferredPort);
      const useExistingEnv: "dev" | "prod" =
        selectedInstance.envHint === "dev"
          ? "dev"
          : selectedInstance.envHint === "prod"
            ? "prod"
            : (envPreference ?? "dev");
      if (useExistingEnv === "dev") {
        process.env.NEOTOMA_SESSION_DEV_PORT = String(preferredPort);
        delete process.env.NEOTOMA_SESSION_PROD_PORT;
      } else {
        process.env.NEOTOMA_SESSION_PROD_PORT = String(preferredPort);
        delete process.env.NEOTOMA_SESSION_DEV_PORT;
      }
      await rememberKnownApiPort(preferredPort);
      const actualPort = preferredPort;
      await fetchIntroStats(String(actualPort));
      try {
        const token = await getCliToken();
        const meRes = await fetch(`http://127.0.0.1:${actualPort}/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (meRes.ok) {
          const me = (await meRes.json()) as { user_id?: string };
          if (me.user_id) userIdForWatch = me.user_id;
        }
      } catch {
        // ignore
      }
      if (version != null) {
        const apiLines = buildApiBoxLines(discoveredInstances);
        if (sessionRepoRoot) {
          const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
          const { scanAgentInstructions } = await import("./agent_instructions_scan.js");
          const devPortEnv = process.env.NEOTOMA_SESSION_DEV_PORT;
          const prodPortEnv = process.env.NEOTOMA_SESSION_PROD_PORT;
          const devPort =
            devPortEnv && /^\d+$/.test(devPortEnv) ? parseInt(devPortEnv, 10) : undefined;
          const prodPort =
            prodPortEnv && /^\d+$/.test(prodPortEnv) ? parseInt(prodPortEnv, 10) : undefined;
          const activePortEnv = process.env.NEOTOMA_SESSION_API_PORT;
          const activePort =
            activePortEnv && /^\d+$/.test(activePortEnv) ? parseInt(activePortEnv, 10) : undefined;
          const { configs: mcpConfigs } = await scanForMcpConfigs(process.cwd(), {
            includeUserLevel: true,
            userLevelFirst: true,
            devPort,
            prodPort,
            activePort,
            activeEnv: useExistingEnv,
            neotomaRepoRoot: sessionRepoRoot,
          });
          const effectiveUserId = userIdForWatch ?? LOCAL_DEV_USER_ID;
          const introStats = await getDualEnvIntroStats(sessionRepoRoot, effectiveUserId);
          const recentEvents = await getLastNWatchEntriesAcrossEnvs(
            sessionRepoRoot,
            effectiveUserId,
            WATCH_INITIAL_EVENT_LIMIT
          );
          lastShownWatchEvents = recentEvents.length > 0 ? recentEvents : null;
          const watchLines =
            recentEvents.length > 0 ? formatWatchTable(recentEvents, new Date()) : undefined;
          if (watchLines != null && recentEvents.length > 0) {
            sessionWatchDisplayRef = { watchLines, watchEventCount: recentEvents.length };
          } else {
            sessionWatchDisplayRef = null;
          }
          const introContent = buildIntroBoxContent(version, introStats, useExistingEnv);
          const agentScan = await scanAgentInstructions(sessionRepoRoot, {
            includeUserLevel: true,
          });
          const initContext = await getInitContextStatus(sessionRepoRoot ?? null);
          const installationLines = buildInstallationBoxLines(
            mcpConfigs,
            agentScan,
            initContext,
            sessionRepoRoot ?? null
          );
          const rawSessionBoxWidth = Math.max(
            computeBoxInnerWidth(introContent.lines, {
              title: introContent.title,
              padding: 2,
            }),
            computeBoxInnerWidth(apiLines, { title: " APIs ", padding: 1 }),
            watchLines != null
              ? computeBoxInnerWidth(watchLines, { title: " Recent events ", padding: 1 })
              : 0,
            computeBoxInnerWidth(installationLines, { title: " Initialization ", padding: 1 })
          );
          const sessionBoxWidth = getSessionBoxWidth(rawSessionBoxWidth);
          const { output } = buildStatusBlockOutput(
            {
              introContent,
              apiLines,
              watchLines,
              watchEventCount: recentEvents.length > 0 ? recentEvents.length : undefined,
              installationLines,
            },
            sessionBoxWidth
          );
          process.stdout.write(output);
          storedSessionBoxWidth = sessionBoxWidth;
          storedStatusBlockRedrawData = {
            introContent,
            apiLines,
            watchLines,
            watchEventCount: recentEvents.length > 0 ? recentEvents.length : undefined,
            installationLines,
            rawSessionBoxWidth,
          };
        } else {
          // No sessionRepoRoot (e.g. cwd not in Neotoma repo) but we have API instances: still show full status block.
          // Resolve repo from cwd for direct local DB reads (intro + recent events) when possible.
          const repoRootForLocal = await findRepoRoot(process.cwd());
          const effectiveUserId = userIdForWatch ?? LOCAL_DEV_USER_ID;
          const introStatsOrFallback = repoRootForLocal
            ? await getDualEnvIntroStats(repoRootForLocal, effectiveUserId)
            : ["Production data: unavailable", "Development data: unavailable"];
          const recentEvents = repoRootForLocal
            ? await getLastNWatchEntriesAcrossEnvs(
                repoRootForLocal,
                effectiveUserId,
                WATCH_INITIAL_EVENT_LIMIT
              )
            : [];
          lastShownWatchEvents = recentEvents.length > 0 ? recentEvents : null;
          const watchLines =
            recentEvents.length > 0 ? formatWatchTable(recentEvents, new Date()) : undefined;
          sessionWatchDisplayRef =
            watchLines != null && recentEvents.length > 0
              ? { watchLines, watchEventCount: recentEvents.length }
              : null;
          const introContent = buildIntroBoxContent(version, introStatsOrFallback, useExistingEnv);
          const { scanForMcpConfigs } = await import("./mcp_config_scan.js");
          const { scanAgentInstructions } = await import("./agent_instructions_scan.js");
          const devPortEnv = process.env.NEOTOMA_SESSION_DEV_PORT;
          const prodPortEnv = process.env.NEOTOMA_SESSION_PROD_PORT;
          const devPort =
            devPortEnv && /^\d+$/.test(devPortEnv) ? parseInt(devPortEnv, 10) : undefined;
          const prodPort =
            prodPortEnv && /^\d+$/.test(prodPortEnv) ? parseInt(prodPortEnv, 10) : undefined;
          const activePortEnv = process.env.NEOTOMA_SESSION_API_PORT;
          const activePort =
            activePortEnv && /^\d+$/.test(activePortEnv) ? parseInt(activePortEnv, 10) : undefined;
          const { configs: mcpConfigs } = await scanForMcpConfigs(process.cwd(), {
            includeUserLevel: true,
            userLevelFirst: true,
            devPort,
            prodPort,
            activePort,
            activeEnv: useExistingEnv,
            neotomaRepoRoot: repoRootForLocal,
          });
          const agentScan = await scanAgentInstructions(repoRootForLocal ?? process.cwd(), {
            includeUserLevel: true,
          });
          const initContext = await getInitContextStatus(repoRootForLocal ?? null);
          const installationLines = buildInstallationBoxLines(
            mcpConfigs,
            agentScan,
            initContext,
            repoRootForLocal ?? null
          );
          const rawSessionBoxWidth = Math.max(
            computeBoxInnerWidth(introContent.lines, {
              title: introContent.title,
              padding: 2,
            }),
            computeBoxInnerWidth(apiLines, { title: " APIs ", padding: 1 }),
            watchLines != null
              ? computeBoxInnerWidth(watchLines, { title: " Recent events ", padding: 1 })
              : 0,
            computeBoxInnerWidth(installationLines, { title: " Initialization ", padding: 1 })
          );
          const sessionBoxWidth = getSessionBoxWidth(rawSessionBoxWidth);
          const { output } = buildStatusBlockOutput(
            {
              introContent,
              apiLines,
              watchLines,
              watchEventCount: getWatchEventCount(recentEvents),
              installationLines,
            },
            sessionBoxWidth
          );
          process.stdout.write(output);
          storedSessionBoxWidth = sessionBoxWidth;
          storedStatusBlockRedrawData = {
            introContent,
            apiLines,
            watchLines,
            watchEventCount: getWatchEventCount(recentEvents),
            installationLines,
            rawSessionBoxWidth,
          };
        }
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

    // cli-instructions auto-check: silently update env section in existing rule files.
    if (sessionRepoRoot) {
      try {
        const { autoUpdateCliInstructionsEnv } = await import("./agent_instructions_scan.js");
        await autoUpdateCliInstructionsEnv(sessionRepoRoot, preferredEnv);
      } catch {
        // Non-fatal; session continues
      }
    }

    debugLog("Starting session REPL (runSessionLoop)");
    const suggestionLinesRef = { current: 0 };
    const lastReadyPhraseRef = { current: SESSION_READY_PHRASES[0]! };
    const lastDetailOutputRef = { current: null as string | null };
    let redrawStatusBlock: RedrawStatusBlockFn | undefined;
    let statusBlockLineCount: number | undefined;
    if (storedStatusBlockRedrawData != null) {
      const data = storedStatusBlockRedrawData;
      redrawStatusBlock = (_currentBuffer: string) => {
        const newWidth = getSessionBoxWidth(data.rawSessionBoxWidth);
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
      userId: userIdForWatch ?? LOCAL_DEV_USER_ID,
      redrawStatusBlock,
      statusBlockLineCount,
      suggestionLinesRef,
      lastReadyPhraseRef,
      lastDetailOutputRef,
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
