/**
 * `neotoma processes list|kill` — local OS process discovery (ps) for Neotoma-related
 * dev servers, MCP stdio shims, and build helpers. Does not call the Neotoma HTTP API.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import type { Command } from "commander";
import { dim, getTerminalWidth } from "../format.js";
import { CANDIDATE_API_PORTS } from "../config.js";

export type OutputMode = "json" | "pretty";

export type NeotomaProcessRow = {
  pid: number;
  ppid: number;
  label: string;
  command: string;
  /** TCP LISTEN ports for this PID (`lsof`); empty when none or lsof unavailable. */
  ports: number[];
  /**
   * Heuristic environment: `dev` | `prod` | `mix` (conflicting signals) | `?` (unknown).
   * Derived from argv tokens (NEOTOMA_ENV, npm script names, launchd wrappers) and listen ports.
   */
  env_hint: string;
  /**
   * Stable role tags for filtering / tooling (e.g. `server`, `mcp`, `build`, `orchestrator`, `tunnel`, `tooling`, `other`).
   */
  categories: string[];
};

type PsProcessNode = {
  pid: number;
  ppid: number;
  command: string;
};

/** One row for `neotoma processes servers` (Neotoma server-class processes). */
export type NeotomaServerProcessSummary = {
  pid: number;
  /** Resolved `NEOTOMA_ENV` when visible, else nearest stack-level heuristic `env_hint`. */
  neotoma_env: string;
  /** Comma-separated TCP listen ports for this stack (3080/3180 first when present), or `-`. */
  port: string;
  /** LaunchAgent label on macOS when inferable from the process ancestry, else `-`. */
  launchagent: string;
  /** `NEOTOMA_DATA_DIR` when visible on this PID or its nearest server stack peer, else `-`. */
  data_dir: string;
  /**
   * Likely log locations for this PID (deduped): event log file, app logs directory when distinct,
   * `neotoma api start --background` api.log under ~/.config/neotoma, optional MCP session log under
   * NEOTOMA_PROJECT_ROOT (mirrors `src/config.ts` + CLI conventions; best-effort).
   */
  log_paths: string[];
};

export type ProcessesCliHooks = {
  resolveOutputMode: () => OutputMode;
  writeOutput: (value: unknown, mode: OutputMode) => void;
  writeCliError: (err: unknown) => void;
};

const DEFAULT_SERVERS_WATCH_INTERVAL_MS = 3000;
const WATCH_ANSI = {
  clearScreen: "\u001b[2J\u001b[H",
  hideCursor: "\u001b[?25l",
  showCursor: "\u001b[?25h",
};

function parsePsLine(line: string): { pid: number; ppid: number; args: string } | null {
  const t = line.trim();
  if (!t) return null;
  const sp = t.indexOf(" ");
  if (sp === -1) return null;
  const pid = parseInt(t.slice(0, sp), 10);
  const rest = t.slice(sp + 1).trimStart();
  const sp2 = rest.indexOf(" ");
  if (sp2 === -1) return null;
  const ppid = parseInt(rest.slice(0, sp2), 10);
  const args = rest.slice(sp2 + 1).trimStart();
  if (!Number.isFinite(pid) || !Number.isFinite(ppid)) return null;
  return { pid, ppid, args };
}

export function parsePsSnapshotNodes(raw: string): PsProcessNode[] {
  const out: PsProcessNode[] = [];
  for (const line of raw.split("\n")) {
    const parsed = parsePsLine(line);
    if (!parsed) continue;
    out.push({ pid: parsed.pid, ppid: parsed.ppid, command: parsed.args });
  }
  out.sort((a, b) => a.pid - b.pid);
  return out;
}

/** Exported for unit tests: classify argv into a short label, or null if not Neotoma-related. */
export function classifyNeotomaProcess(args: string): string | null {
  const a = args;
  const lower = a.toLowerCase();
  if (lower.includes("grep ") && !lower.includes("neotoma")) return null;
  if (lower.includes("ps -ax") || lower.includes("ps axo")) return null;

  const isNeotomaPath =
    a.includes("/repos/neotoma/") ||
    a.includes("neotoma-hotfix") ||
    a.includes("/tmp/neotoma-hotfix") ||
    a.includes("private/tmp/neotoma") ||
    a.includes("run_neotoma_mcp") ||
    a.includes("run_watch_build_launchd") ||
    (lower.includes("mcp proxy") && a.includes("neotoma")) ||
    (lower.includes("cursor-hooks") && a.includes("repos/neotoma")) ||
    (lower.includes("opencode") && a.includes("repos/neotoma"));

  if (!isNeotomaPath) {
    if (
      lower.includes("tsx watch src/actions") &&
      (a.includes("repos/neotoma") || a.includes("neotoma-hotfix") || a.includes("tmp/neotoma"))
    ) {
      // cwd-relative tsx watch from a Neotoma checkout
    } else if (
      lower.includes("run-dev-task.js") &&
      (lower.includes("tsx watch src/actions") ||
        (lower.includes("--watch-path") && lower.includes("src/actions.ts")))
    ) {
      // Neotoma dev stack uses this wrapper; argv often has no repo path (cwd-relative).
    } else if (lower.includes("src/actions.ts") && a.includes("neotoma") && lower.includes("tsx")) {
      // worker node preflight lines
    } else if (/\bneotoma_env=/i.test(a) && /\bstart:server\b/.test(lower)) {
      // cross-env NEOTOMA_ENV=... npm run start:server (prod chain via pick-port)
    } else if (/\bnpm run start:server(:prod)?\s*$/.test(lower)) {
      // npm run start:server or start:server:prod (launchd root or child in prod chain)
    } else if (/\bnode dist\/actions\.js\b/.test(a)) {
      // compiled prod entrypoint (node dist/actions.js)
    } else {
      return null;
    }
  }

  if (a.includes("run_neotoma_mcp")) return "mcp_stdio";
  if (a.includes("run_watch_build_launchd")) return "watch_build_launchd";
  if (lower.includes("mcp proxy") && a.includes("cli/index")) return "mcp_proxy";
  if (a.includes("pick-port.js") && a.includes("neotoma")) return "api_orchestrator";
  if (
    a.includes("/bin/concurrently") &&
    a.includes("neotoma") &&
    (lower.includes("tsx watch") ||
      lower.includes("run-neotoma-api-node-watch") ||
      (lower.includes("--watch-path") && lower.includes("src/actions.ts")))
  ) {
    return "api_orchestrator";
  }
  if (
    a.includes("scripts/run-dev-task.js") &&
    (lower.includes("tsx watch") ||
      (lower.includes("--watch-path") && lower.includes("src/actions.ts")))
  ) {
    return "run_dev_task";
  }
  if (a.includes(".bin/tsx watch src/actions.ts")) {
    if (a.includes("neotoma-hotfix-0.9.1")) return "hotfix_watcher";
    if (a.includes("/private/tmp/neotoma-hotfix") || a.includes("neotoma-hotfix-v0.10.1"))
      return "tmp_hotfix_watcher";
    if (a.includes("/repos/neotoma/")) return "api_watcher";
    return "tsx_watcher";
  }
  if (lower.includes("tsc") && lower.includes("watch") && a.includes("/repos/neotoma/")) return "tsc_watch";
  if (lower.includes("esbuild") && a.includes("/repos/neotoma/")) return "esbuild_ping";
  if (lower.includes("cursor-hooks") && a.includes("repos/neotoma")) return "cursor_hook";
  if (lower.includes("opencode") && a.includes("repos/neotoma/tmp")) return "opencode_smoke";
  if (
    lower.includes("--watch-path") &&
    (lower.includes("src/actions.ts") || lower.includes("mcp_ws_bridge.ts")) &&
    (a.includes("repos/neotoma") || a.includes("neotoma-hotfix"))
  ) {
    return "api_watcher";
  }
  if (lower.includes("run-neotoma-api-node-watch.sh") && a.includes("neotoma")) return "run_dev_task";
  if (lower.includes("src/actions.ts") && a.includes("neotoma")) return "actions_worker";
  // Prod server chain: cross-env NEOTOMA_ENV + start:server, or node dist/actions.js
  if (/\bneotoma_env=/i.test(a) && /\bstart:server\b/.test(lower)) return "prod_server";
  if (/\bnode dist\/actions\.js\b/.test(a)) return "prod_server";
  if (/\bnpm run start:server(:prod)?\s*$/.test(lower)) return "prod_server";
  return "other_neotoma";
}

/** Internal classifier label → stable category tags (order not significant until sorted). */
const LABEL_TO_CATEGORIES: Record<string, string[]> = {
  api_watcher: ["server"],
  run_dev_task: ["orchestrator", "server"],
  tsx_watcher: ["server"],
  api_orchestrator: ["orchestrator"],
  mcp_proxy: ["mcp"],
  mcp_stdio: ["mcp"],
  tsc_watch: ["build"],
  watch_build_launchd: ["build"],
  esbuild_ping: ["build"],
  cursor_hook: ["tooling"],
  actions_worker: ["server"],
  prod_server: ["server"],
  hotfix_watcher: ["server"],
  tmp_hotfix_watcher: ["server"],
  opencode_smoke: ["tooling"],
  other_neotoma: ["other"],
};

function uniqSortedTags(tags: string[]): string[] {
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
}

/**
 * Derive display categories from the process classifier label and full argv.
 * Exported for unit tests.
 */
export function deriveProcessCategories(label: string, command: string): string[] {
  const base = LABEL_TO_CATEGORIES[label] ?? ["other"];
  const extra: string[] = [];
  const lower = command.toLowerCase();
  if (lower.includes("setup-https-tunnel") || lower.includes("ngrok")) {
    extra.push("tunnel");
  }
  return uniqSortedTags([...base, ...extra]);
}

/**
 * Heuristic dev / prod / mixed / unknown from argv and listen ports.
 * Exported for unit tests.
 */
export function inferProcessEnvHint(command: string, ports: readonly number[]): string {
  const c = command;
  const lower = c.toLowerCase();
  const hasProdPort = ports.includes(3180);
  const hasDevPort = ports.includes(3080);

  let prodScore = 0;
  let devScore = 0;

  if (hasProdPort) prodScore += 2;
  if (hasDevPort) devScore += 2;

  if (/\bNEOTOMA_ENV=production\b/i.test(c) || /\bNEOTOMA_ENV=prod\b/i.test(c)) prodScore += 3;
  if (/\bNEOTOMA_ENV=development\b/i.test(c) || /\bNEOTOMA_ENV=dev\b/i.test(c)) devScore += 2;

  if (lower.includes("dev:full:prod") || lower.includes("dev:inspector:prod")) prodScore += 3;
  if (lower.includes("prod-target") || lower.includes("build:inspector:prod-target"))
    prodScore += 2;
  if (lower.includes("run_watch_full_prod_launchd")) prodScore += 3;

  if (lower.includes("run_dev_servers_launchd") || lower.includes("dev:server:tunnel")) devScore += 3;
  if (lower.includes("dev:server:tunnel:types")) devScore += 2;
  if (lower.includes("tunnel_noninteractive")) devScore += 1;
  if (lower.includes("setup-https-tunnel")) devScore += 2;

  if (lower.includes("pick-port.js")) {
    if (/--print-resources\s+3180\b/.test(c) || /\bpick-port\.js\s+3180\s+5295\s+3101\b/.test(c)) {
      prodScore += 3;
    }
    if (/\bpick-port\.js\s+3080\b/.test(c) && !lower.includes("3180")) {
      devScore += 2;
    }
  }

  if (/\bVITE_NEOTOMA_ENV=prod\b/i.test(c)) prodScore += 1;
  if (/\bVITE_NEOTOMA_ENV=dev\b/i.test(c)) devScore += 1;

  if (/\bNEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE=prod\b/i.test(c)) prodScore += 2;
  if (/\bNEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE=dev\b/i.test(c)) devScore += 2;

  if (/127\.0\.0\.1:3180\/mcp|:3180\/mcp/.test(c)) prodScore += 1;
  if (/127\.0\.0\.1:3080\/mcp|:3080\/mcp/.test(c)) devScore += 1;

  if (/\brun_neotoma_mcp_stdio.*prod\b/i.test(lower) || lower.includes("mcp_stdio_prod")) {
    prodScore += 2;
  }
  if (/\brun_neotoma_mcp_stdio\.sh\b/i.test(lower) && !/prod/.test(lower)) {
    devScore += 1;
  }

  if (/\bnode\s+dist\/actions\.js\b/i.test(c) && prodScore === 0 && !hasDevPort) {
    prodScore += 1;
  }

  if (prodScore > 0 && devScore > 0) return "mix";
  if (prodScore > 0) return "prod";
  if (devScore > 0) return "dev";
  return "?";
}

function readPsSnapshot(): string {
  const platform = process.platform;
  if (platform === "win32") {
    throw new Error("neotoma processes is not supported on Windows (no portable ps parser).");
  }
  const args =
    platform === "darwin"
      ? ["-ax", "-o", "pid=,ppid=,args="]
      : ["-eo", "pid=,ppid=,args="];
  return execFileSync("ps", args, { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 });
}

/** Exported for tests. */
export function parsePsSnapshotForNeotoma(raw: string): NeotomaProcessRow[] {
  const allNodes: { pid: number; ppid: number; args: string }[] = [];
  const out: NeotomaProcessRow[] = [];
  const classifiedPids = new Set<number>();

  for (const line of raw.split("\n")) {
    const parsed = parsePsLine(line);
    if (!parsed) continue;
    allNodes.push(parsed);
    const label = classifyNeotomaProcess(parsed.args);
    if (!label) continue;
    classifiedPids.add(parsed.pid);
    out.push({
      pid: parsed.pid,
      ppid: parsed.ppid,
      label,
      command: parsed.args,
      ports: [],
      env_hint: inferProcessEnvHint(parsed.args, []),
      categories: deriveProcessCategories(label, parsed.args),
    });
  }

  // Second pass: adopt unclassified children whose parent is a classified Neotoma process.
  // Walk the tree iteratively until no new adoptions.
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of allNodes) {
      if (classifiedPids.has(node.pid)) continue;
      if (!classifiedPids.has(node.ppid)) continue;
      const parentRow = out.find((r) => r.pid === node.ppid);
      if (!parentRow) continue;
      const inheritedLabel = inferInheritedLabel(node.args, parentRow);
      classifiedPids.add(node.pid);
      out.push({
        pid: node.pid,
        ppid: node.ppid,
        label: inheritedLabel,
        command: node.args,
        ports: [],
        env_hint: inferProcessEnvHint(node.args, []),
        categories: deriveProcessCategories(inheritedLabel, node.args),
      });
      changed = true;
    }
  }

  out.sort((a, b) => a.pid - b.pid);
  return out;
}

/**
 * When a child process inherits from a classified parent, pick the best label.
 * If the child looks like a server entrypoint, use a server label; otherwise inherit parent's label.
 */
function inferInheritedLabel(args: string, parent: NeotomaProcessRow): string {
  const lower = args.toLowerCase();
  if (/\bnode dist\/actions\.js\b/.test(args)) return "prod_server";
  if (/\bneotoma_env=/i.test(args) && /\bstart:server\b/.test(lower)) return "prod_server";
  if (/\bnpm run start:server\b/.test(lower)) return "prod_server";
  if (/\bsrc\/actions\.ts\b/.test(args)) return "actions_worker";
  if (parent.categories.includes("server") || parent.categories.includes("orchestrator")) {
    return parent.label;
  }
  return parent.label;
}

/** Parse `lsof -nP -iTCP -sTCP:LISTEN -F pn` lines into pid → listen port set. */
export function parseLsofPnOutput(raw: string): Map<number, Set<number>> {
  const byPid = new Map<number, Set<number>>();
  let curPid: number | null = null;
  for (const line of raw.split("\n")) {
    if (line.length < 2) continue;
    const tag = line[0];
    const val = line.slice(1);
    if (tag === "p") {
      const pid = parseInt(val, 10);
      curPid = Number.isFinite(pid) ? pid : null;
    } else if (tag === "n" && curPid !== null) {
      const port = extractTcpListenPortFromLsofNameField(val);
      if (port !== null) {
        let set = byPid.get(curPid);
        if (!set) {
          set = new Set();
          byPid.set(curPid, set);
        }
        set.add(port);
      }
    }
  }
  return byPid;
}

/** Extract TCP port from lsof `-F n` value (e.g. `*:3080`, `127.0.0.1:18080`, `[::1]:8080`). */
export function extractTcpListenPortFromLsofNameField(value: string): number | null {
  const m = value.match(/:(\d{1,5})$/);
  if (!m) return null;
  const p = parseInt(m[1], 10);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return null;
  return p;
}

function readListenTcpPortsByPid(): Map<number, Set<number>> {
  try {
    const raw = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pn"], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseLsofPnOutput(raw);
  } catch {
    return new Map();
  }
}

function sortUniquePorts(ports: Iterable<number>): number[] {
  return [...new Set(ports)].sort((a, b) => a - b);
}

export function enrichProcessRowsWithListenPorts(rows: NeotomaProcessRow[]): NeotomaProcessRow[] {
  const byPid = readListenTcpPortsByPid();
  return rows.map((r) => ({
    ...r,
    ports: sortUniquePorts(byPid.get(r.pid) ?? []),
  }));
}

/** Recompute `env_hint` (uses listen ports) and `categories` after ports are known. */
export function finalizeNeotomaProcessRows(rows: NeotomaProcessRow[]): NeotomaProcessRow[] {
  return rows.map((r) => ({
    ...r,
    env_hint: inferProcessEnvHint(r.command, r.ports),
    categories: deriveProcessCategories(r.label, r.command),
  }));
}

export function scanNeotomaProcesses(): NeotomaProcessRow[] {
  const rows = parsePsSnapshotForNeotoma(readPsSnapshot());
  const enriched = enrichProcessRowsWithListenPorts(rows);
  return finalizeNeotomaProcessRows(enriched);
}

/** Parse `/proc/<pid>/environ` (Linux). Exported for unit tests via buffer helper. */
export function parseProcEnvironBuffer(buf: Buffer): Map<string, string> {
  const m = new Map<string, string>();
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0) {
      const seg = buf.subarray(start, i);
      const eq = seg.indexOf(61);
      if (eq > 0) {
        m.set(seg.subarray(0, eq).toString("utf8"), seg.subarray(eq + 1).toString("utf8"));
      }
      start = i + 1;
    }
  }
  return m;
}

function readProcEnviron(pid: number): Map<string, string> | null {
  if (process.platform === "win32") return null;
  const p = `/proc/${pid}/environ`;
  if (!fs.existsSync(p)) return null;
  try {
    return parseProcEnvironBuffer(fs.readFileSync(p));
  } catch {
    return null;
  }
}

/**
 * Extract `KEY=value` from a ps argv string (cross-env / inline env).
 * Paths with spaces are not captured (returns undefined).
 */
export function extractInlineEnvAssignment(command: string, key: string): string | undefined {
  const re = new RegExp(`(?:^|[\\s])${key}=([^\\s]+)`);
  const m = command.match(re);
  return m?.[1];
}

/** Map NEOTOMA_ENV-style values to short labels for the servers table. */
export function shortNeotomaEnvLabel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  const l = t.toLowerCase();
  if (l === "development" || l === "dev") return "dev";
  if (l === "production" || l === "prod") return "prod";
  if (l === "test" || l === "testing") return "test";
  return t;
}

/**
 * macOS launchd hint: direct child of PID 1, LaunchAgents/Daemons paths, or known launchd entry scripts.
 * On non-macOS returns `-`.
 */
export function inferLaunchdCell(
  platform: NodeJS.Platform,
  ppid: number,
  command: string
): string {
  if (platform !== "darwin") return "-";
  if (ppid === 1) return "yes";
  const lower = command.toLowerCase();
  if (
    lower.includes("/launchagents/") ||
    lower.includes("/launchdaemons/") ||
    lower.includes("run_dev_servers_launchd") ||
    lower.includes("run_watch_full_prod_launchd") ||
    lower.includes("run_watch_build_launchd")
  ) {
    return "yes";
  }
  return "no";
}

function launchAgentLabelFromCommand(command: string): string | undefined {
  const plistMatch = command.match(/\/(?:LaunchAgents|LaunchDaemons)\/([A-Za-z0-9._-]+)\.plist\b/);
  if (plistMatch) return plistMatch[1];

  const lower = command.toLowerCase();
  if (lower.includes("run_dev_server_launchd.sh")) return "com.neotoma.dev-server";
  if (lower.includes("run_dev_servers_launchd.sh")) return "com.neotoma.dev-servers";
  if (lower.includes("run_prod_server_launchd.sh")) return "com.neotoma.prod-server";
  if (lower.includes("run_watch_build_launchd.sh")) return "com.neotoma.watch-build";
  if (lower.includes("run_issues_sync_launchd.sh")) return "com.neotoma.issues-sync";
  if (lower.includes("run_watch_full_prod_launchd.sh")) return "com.neotoma.watch-full-prod";
  if (lower.includes("run_watch_dev_launchd.sh")) return "com.neotoma.watch-dev";
  return undefined;
}

function launchAgentLabelFromPid1Command(node: PsProcessNode): string | undefined {
  if (node.ppid !== 1) return undefined;
  const lower = node.command.toLowerCase();
  if (/\bnpm run dev:server\b/.test(lower)) return "com.neotoma.dev-server";
  if (/\bnpm run dev:server:tunnel\b/.test(lower)) return "com.neotoma.dev-servers";
  if (/\bnpm run start:server:prod\b/.test(lower)) return "com.neotoma.prod-server";
  return undefined;
}

export function inferLaunchAgentLabel(
  platform: NodeJS.Platform,
  pid: number,
  ppid: number,
  command: string,
  psIndex: ReadonlyMap<number, PsProcessNode>
): string {
  if (platform !== "darwin") return "-";

  const direct = launchAgentLabelFromCommand(command);
  if (direct) return direct;

  let current: PsProcessNode | undefined =
    psIndex.get(pid) ?? (ppid > 0 ? { pid, ppid, command } : undefined);
  const seen = new Set<number>();
  while (current && !seen.has(current.pid)) {
    seen.add(current.pid);
    const fromCommand = launchAgentLabelFromCommand(current.command);
    if (fromCommand) return fromCommand;
    const fromPid1 = launchAgentLabelFromPid1Command(current);
    if (fromPid1) return fromPid1;
    if (current.ppid <= 0 || current.ppid === current.pid) break;
    current = psIndex.get(current.ppid);
  }

  return inferLaunchdCell(platform, ppid, command) === "yes" ? "launchd" : "-";
}

function neotomaCliConfigDir(): string {
  return path.join(os.homedir(), ".config", "neotoma");
}

/** `neotoma api start --background` / `neotoma api logs` capture file (same layout as CLI). */
function backgroundApiLogFile(isProduction: boolean): string {
  return path.join(neotomaCliConfigDir(), isProduction ? "logs_prod" : "logs", "api.log");
}

/**
 * Whether resolved paths should use production layout (`logs_prod`, `events.prod.log`, …).
 * Mirrors `src/config.ts` `env === "production"` when `NEOTOMA_ENV` is unknown.
 */
export function inferIsProductionForLogs(
  envMap: Map<string, string> | null,
  command: string,
  neotoma_env: string,
  ports: readonly number[]
): boolean {
  const raw =
    envMap?.get("NEOTOMA_ENV")?.trim() || extractInlineEnvAssignment(command, "NEOTOMA_ENV")?.trim();
  if (raw) {
    const l = raw.toLowerCase();
    if (l === "production" || l === "prod") return true;
    if (l === "development" || l === "dev" || l === "test") return false;
  }
  if (neotoma_env === "prod") return true;
  if (neotoma_env === "dev") return false;
  const has3180 = ports.includes(3180);
  const has3080 = ports.includes(3080);
  if (has3180 && !has3080) return true;
  if (has3080 && !has3180) return false;
  return false;
}

function dedupePathList(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const p of paths) {
    const t = p.trim();
    if (!t) continue;
    const key = path.normalize(t);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
  }
  return uniq;
}

/**
 * Best-effort log locations for a server PID (mirrors `src/config.ts` + `src/shared/local_transport.ts`
 * session log + CLI background api.log). Omits paths that cannot be inferred without `NEOTOMA_DATA_DIR`.
 */
export function resolveNeotomaServerLogPaths(input: {
  envMap: Map<string, string> | null;
  command: string;
  neotoma_env: string;
  ports: readonly number[];
  data_dir: string;
}): string[] {
  const { envMap, command, neotoma_env, ports, data_dir } = input;
  const isProd = inferIsProductionForLogs(envMap, command, neotoma_env, ports);
  const eventFn = isProd ? "events.prod.log" : "events.log";
  const dataDirResolved = data_dir !== "-" ? data_dir : undefined;

  const evExplicit =
    envMap?.get("NEOTOMA_EVENT_LOG_PATH")?.trim() ||
    extractInlineEnvAssignment(command, "NEOTOMA_EVENT_LOG_PATH")?.trim();
  const evDir =
    envMap?.get("NEOTOMA_EVENT_LOG_DIR")?.trim() ||
    extractInlineEnvAssignment(command, "NEOTOMA_EVENT_LOG_DIR")?.trim();

  let eventPath: string | undefined;
  if (evExplicit) eventPath = evExplicit;
  else if (evDir) eventPath = path.join(evDir, eventFn);
  else if (dataDirResolved) eventPath = path.join(dataDirResolved, "logs", eventFn);

  const logsDirExplicit =
    envMap?.get("NEOTOMA_LOGS_DIR")?.trim() ||
    extractInlineEnvAssignment(command, "NEOTOMA_LOGS_DIR")?.trim();
  let logsDir: string | undefined;
  if (logsDirExplicit) logsDir = logsDirExplicit;
  else if (dataDirResolved) logsDir = path.join(dataDirResolved, isProd ? "logs_prod" : "logs");

  const apiBg = backgroundApiLogFile(isProd);

  const projectRoot =
    envMap?.get("NEOTOMA_PROJECT_ROOT")?.trim() ||
    extractInlineEnvAssignment(command, "NEOTOMA_PROJECT_ROOT")?.trim();
  let sessionPath: string | undefined;
  if (projectRoot) {
    sessionPath = path.join(
      projectRoot,
      "data",
      "logs",
      isProd ? "session.prod.log" : "session.log"
    );
  }

  const out: string[] = [];
  if (eventPath) out.push(eventPath);
  if (logsDir) {
    const evParent = eventPath ? path.normalize(path.dirname(eventPath)) : "";
    if (!eventPath || path.normalize(logsDir) !== evParent) out.push(logsDir);
  }
  out.push(apiBg);
  if (sessionPath) out.push(sessionPath);

  return dedupePathList(out);
}

/** Subset of ports that are default Neotoma HTTP API candidates (3080 / 3180). */
export function neotomaApiListenPorts(ports: readonly number[]): number[] {
  return CANDIDATE_API_PORTS.filter((p) => ports.includes(p));
}

/** All TCP listen ports for display: default API ports first, then ascending. */
export function formatListenPortsForServers(ports: readonly number[]): string {
  if (!ports.length) return "-";
  const head = neotomaApiListenPorts(ports);
  const rest = [...new Set(ports)]
    .filter((p) => !CANDIDATE_API_PORTS.includes(p))
    .sort((a, b) => a - b);
  return [...head, ...rest].join(",");
}

/** Processes classified as Neotoma servers (any port; not limited to 3080/3180). */
export function filterNeotomaServerRows(rows: readonly NeotomaProcessRow[]): NeotomaProcessRow[] {
  return rows.filter((r) => r.categories.includes("server"));
}

type ServerRowContext = {
  ports: number[];
  neotoma_env: string;
  data_dir: string;
};

type ServerRowMeta = {
  row: NeotomaProcessRow;
  envMap: Map<string, string> | null;
  explicitEnv: string | undefined;
  data_dir: string;
};

function readPsIndexBestEffort(psSnapshotRaw?: string): Map<number, PsProcessNode> {
  try {
    const raw = psSnapshotRaw ?? readPsSnapshot();
    return new Map(parsePsSnapshotNodes(raw).map((node) => [node.pid, node]));
  } catch {
    return new Map();
  }
}

function connectedServerPids(
  startPid: number,
  byPid: ReadonlyMap<number, ServerRowMeta>,
  childrenByPid: ReadonlyMap<number, number[]>
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const queue = [startPid];
  while (queue.length > 0) {
    const pid = queue.shift();
    if (pid === undefined || seen.has(pid) || !byPid.has(pid)) continue;
    seen.add(pid);
    out.push(pid);
    const parentPid = byPid.get(pid)?.row.ppid;
    if (parentPid && byPid.has(parentPid) && !seen.has(parentPid)) queue.push(parentPid);
    for (const childPid of childrenByPid.get(pid) ?? []) {
      if (!seen.has(childPid) && byPid.has(childPid)) queue.push(childPid);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

function pickClusterEnv(meta: readonly ServerRowMeta[]): string {
  const explicit = [...new Set(meta.map((m) => m.explicitEnv).filter((v): v is string => Boolean(v)))];
  if (explicit.length === 1) return explicit[0];
  if (explicit.length > 1) return "mix";

  const hinted = [
    ...new Set(
      meta
        .map((m) => m.row.env_hint)
        .filter((v) => v && v !== "?")
    ),
  ];
  if (hinted.length === 1) return hinted[0];
  if (hinted.length > 1) return "mix";
  return "?";
}

function pickClusterDataDir(meta: readonly ServerRowMeta[]): string {
  const dirs = [...new Set(meta.map((m) => m.data_dir).filter((v) => v !== "-"))];
  if (dirs.length === 0) return "-";
  return dirs.sort((a, b) => a.localeCompare(b))[0];
}

function buildServerContextByPid(rows: readonly NeotomaProcessRow[]): Map<number, ServerRowContext> {
  const candidates = rows.filter(
    (row) => row.categories.includes("server") || row.categories.includes("orchestrator")
  );
  const metaByPid = new Map<number, ServerRowMeta>();
  const childrenByPid = new Map<number, number[]>();

  for (const row of candidates) {
    const envMap = readProcEnviron(row.pid);
    const explicitEnv = shortNeotomaEnvLabel(
      envMap?.get("NEOTOMA_ENV") ?? extractInlineEnvAssignment(row.command, "NEOTOMA_ENV")
    );
    const fromProcDd = envMap?.get("NEOTOMA_DATA_DIR")?.trim();
    const fromArgvDd = extractInlineEnvAssignment(row.command, "NEOTOMA_DATA_DIR")?.trim();
    const data_dir =
      fromProcDd && fromProcDd.length > 0
        ? fromProcDd
        : fromArgvDd && fromArgvDd.length > 0
          ? fromArgvDd
          : "-";
    metaByPid.set(row.pid, { row, envMap, explicitEnv, data_dir });
    if (!childrenByPid.has(row.ppid)) childrenByPid.set(row.ppid, []);
    childrenByPid.get(row.ppid)?.push(row.pid);
  }

  const contextByPid = new Map<number, ServerRowContext>();
  for (const pid of metaByPid.keys()) {
    if (contextByPid.has(pid)) continue;
    const componentPids = connectedServerPids(pid, metaByPid, childrenByPid);
    const componentMeta = componentPids
      .map((componentPid) => metaByPid.get(componentPid))
      .filter((m): m is ServerRowMeta => Boolean(m));
    const ctx: ServerRowContext = {
      ports: sortUniquePorts(componentMeta.flatMap((m) => m.row.ports)),
      neotoma_env: pickClusterEnv(componentMeta),
      data_dir: pickClusterDataDir(componentMeta),
    };
    for (const componentPid of componentPids) {
      contextByPid.set(componentPid, ctx);
    }
  }
  return contextByPid;
}

export function buildNeotomaServerSummaries(
  rows: readonly NeotomaProcessRow[],
  options: { psSnapshotRaw?: string } = {}
): NeotomaServerProcessSummary[] {
  const filtered = filterNeotomaServerRows(rows);
  const psIndex = readPsIndexBestEffort(options.psSnapshotRaw);
  const serverContextByPid = buildServerContextByPid(rows);

  // Deduplicate by server stack: group connected components, emit one summary per stack
  // using the PID that actually holds the TCP listener (or deepest child if none detected).
  const seen = new Set<number>();
  const summaries: NeotomaServerProcessSummary[] = [];

  for (const r of filtered) {
    if (seen.has(r.pid)) continue;
    const stackContext = serverContextByPid.get(r.pid);
    // Find all PIDs in this connected component that are in the filtered (server) set
    const componentPids = stackContext
      ? filtered.filter((f) => serverContextByPid.get(f.pid) === stackContext).map((f) => f.pid)
      : [r.pid];
    for (const pid of componentPids) seen.add(pid);

    // Pick the representative PID: prefer the one that actually has the port bound
    // (its own ports array is non-empty), otherwise pick the highest PID (deepest child).
    const representative =
      filtered.find((f) => componentPids.includes(f.pid) && f.ports.length > 0) ??
      filtered.filter((f) => componentPids.includes(f.pid)).sort((a, b) => b.pid - a.pid)[0] ??
      r;

    const envMap = readProcEnviron(representative.pid);
    const neotoma_env = stackContext?.neotoma_env ?? representative.env_hint;
    const fromProcDd = envMap?.get("NEOTOMA_DATA_DIR")?.trim();
    const fromArgvDd = extractInlineEnvAssignment(representative.command, "NEOTOMA_DATA_DIR")?.trim();
    let data_dir = "-";
    if (fromProcDd && fromProcDd.length > 0) data_dir = fromProcDd;
    else if (fromArgvDd && fromArgvDd.length > 0) data_dir = fromArgvDd;
    else if (stackContext?.data_dir && stackContext.data_dir !== "-") data_dir = stackContext.data_dir;
    const ports = stackContext && stackContext.ports.length > 0 ? stackContext.ports : representative.ports;
    const log_paths = resolveNeotomaServerLogPaths({
      envMap,
      command: representative.command,
      neotoma_env,
      ports,
      data_dir,
    });
    summaries.push({
      pid: representative.pid,
      neotoma_env,
      port: formatListenPortsForServers(ports),
      launchagent: inferLaunchAgentLabel(process.platform, representative.pid, representative.ppid, representative.command, psIndex),
      data_dir,
      log_paths,
    });
  }

  summaries.sort((a, b) => a.pid - b.pid);
  return summaries;
}

function formatServersTable(summaries: NeotomaServerProcessSummary[]): string {
  if (summaries.length === 0) {
    return "No Neotoma server processes detected (no PIDs with server role).\n";
  }
  const pidW = Math.max(3, ...summaries.map((s) => String(s.pid).length));
  const envW = Math.max(3, "ENV".length, ...summaries.map((s) => s.neotoma_env.length));
  const portW = Math.max(4, "PORT".length, ...summaries.map((s) => s.port.length));
  const agentW = Math.max(11, "LAUNCHAGENT".length, ...summaries.map((s) => s.launchagent.length));
  const termW = getTerminalWidth(0);
  const prefixLen = pidW + 2 + envW + 2 + portW + 2 + agentW + 2;
  const dirColW = Math.max(16, termW - prefixLen);
  const logLabel = "LOGS";
  const logIndent = " ".repeat(prefixLen);
  const logColW = Math.max(24, termW - logIndent.length - logLabel.length - 2);
  const lines: string[] = [];
  const hdr =
    `${"PID".padStart(pidW)}  ${"ENV".padEnd(envW)}  ${"PORT".padEnd(portW)}  ${"LAUNCHAGENT".padEnd(agentW)}  DATA_DIR`;
  lines.push(hdr);
  lines.push("-".repeat(Math.min(termW, Math.max(hdr.length, prefixLen + dirColW))));
  for (const s of summaries) {
    const dir = s.data_dir;
    const dirShown = dir.length <= dirColW ? dir : dir.slice(0, Math.max(0, dirColW - 1)) + "…";
    lines.push(
      `${String(s.pid).padStart(pidW)}  ${s.neotoma_env.padEnd(envW)}  ${s.port.padEnd(portW)}  ${s.launchagent.padEnd(agentW)}  ${dirShown}`
    );
    const logJoin = s.log_paths.join("; ");
    const wrappedLogs = wrapCommandForColumn(logJoin, logColW);
    const logLead = `${logIndent}${logLabel}  `;
    lines.push(logLead + (wrappedLogs[0] ?? ""));
    const contPad = " ".repeat(logLabel.length + 2);
    for (let i = 1; i < wrappedLogs.length; i++) {
      lines.push(`${logIndent}${contPad}${wrappedLogs[i]}`);
    }
  }
  lines.push("");
  lines.push(`Total: ${summaries.length} server stack(s)`);
  lines.push(
    dim(
      "One row per server stack (parent-child chain collapsed to the listener PID). ENV: NEOTOMA_ENV when readable (else nearest server-stack env). PORT: stack-level TCP listeners (3080/3180 first). LAUNCHAGENT: macOS LaunchAgent label inferred from ancestry when known, else `-`. DATA_DIR: NEOTOMA_DATA_DIR when readable on this PID or its server stack, else `-`. LOGS: event + app logs dir + ~/.config/neotoma/.../api.log + optional session log."
    ) + "\n"
  );
  return lines.join("\n");
}

export function parseWatchIntervalMs(
  raw: string | undefined,
  defaultMs = DEFAULT_SERVERS_WATCH_INTERVAL_MS
): number {
  if (!raw || raw.trim().length === 0) return defaultMs;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 250) {
    throw new Error("Invalid --interval; provide an integer >= 250 (milliseconds).");
  }
  return parsed;
}

function formatWatchIntervalLabel(intervalMs: number): string {
  const seconds = intervalMs / 1000;
  const rounded = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(/\.0$/, "");
  return `${rounded}s`;
}

function watchTimestampLabel(refreshedAt: Date): string {
  return refreshedAt.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

export function formatServersWatchSnapshot(
  summaries: NeotomaServerProcessSummary[],
  options: { intervalMs: number; refreshedAt?: Date }
): string {
  const refreshedAt = options.refreshedAt ?? new Date();
  const body = formatServersTable(summaries).replace(/\n$/, "");
  return [
    dim(
      `Updated ${watchTimestampLabel(refreshedAt)}. Refreshing every ${formatWatchIntervalLabel(options.intervalMs)}. Press Ctrl+C to exit.`
    ),
    "",
    body,
    "",
  ].join("\n");
}

async function runServersWatchLoop(options: {
  intervalMs: number;
  outputMode: OutputMode;
}): Promise<void> {
  const { intervalMs, outputMode } = options;
  const useTtyRedraw = outputMode !== "json" && process.stdout.isTTY;

  const render = (): void => {
    const refreshedAt = new Date();
    const summaries = buildNeotomaServerSummaries(scanNeotomaProcesses());
    if (outputMode === "json") {
      process.stdout.write(JSON.stringify({ refreshed_at: refreshedAt.toISOString(), servers: summaries }) + "\n");
      return;
    }
    if (useTtyRedraw) {
      process.stdout.write(WATCH_ANSI.clearScreen + WATCH_ANSI.hideCursor);
    } else {
      process.stdout.write(`\n=== ${watchTimestampLabel(refreshedAt)} ===\n`);
    }
    process.stdout.write(formatServersWatchSnapshot(summaries, { intervalMs, refreshedAt }));
  };

  render();

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;

    const cleanup = (showNewline = true): void => {
      if (done) return;
      done = true;
      if (timer) clearInterval(timer);
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
      if (useTtyRedraw) {
        process.stdout.write(WATCH_ANSI.showCursor);
        if (showNewline) process.stdout.write("\n");
      }
    };

    const onSigint = (): void => {
      cleanup();
      resolve();
    };

    const onSigterm = (): void => {
      cleanup(false);
      resolve();
    };

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
    timer = setInterval(() => {
      try {
        render();
      } catch (err) {
        cleanup();
        reject(err);
      }
    }, intervalMs);
  });
}

/** Word-wrap a command for a fixed-width COMMAND column (continuation lines align under column). */
export function wrapCommandForColumn(command: string, width: number): string[] {
  if (width <= 0) return [command];
  if (command.length <= width) return [command];
  const lines: string[] = [];
  let remaining = command;
  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }
    const slice = remaining.slice(0, width);
    const lastSpace = slice.lastIndexOf(" ");
    const minFirstChunk = Math.min(12, Math.floor(width / 2));
    if (lastSpace >= minFirstChunk) {
      lines.push(remaining.slice(0, lastSpace));
      remaining = remaining.slice(lastSpace + 1).replace(/^\s+/, "");
      continue;
    }
    lines.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  return lines;
}

function formatPortsCell(ports: number[]): string {
  return ports.length > 0 ? ports.join(",") : "-";
}

function formatCategoriesCell(categories: string[]): string {
  return categories.length > 0 ? categories.join(",") : "-";
}

function formatTable(rows: NeotomaProcessRow[]): string {
  if (rows.length === 0) {
    return "No Neotoma-related processes detected.\n";
  }
  const pidW = Math.max(3, ...rows.map((r) => String(r.pid).length));
  const ppidW = Math.max(4, ...rows.map((r) => String(r.ppid).length));
  const envW = Math.max(3, "ENV".length, ...rows.map((r) => r.env_hint.length));
  const catCells = rows.map((r) => formatCategoriesCell(r.categories));
  const catW = Math.max(4, "CAT".length, ...catCells.map((c) => c.length));
  const labelW = Math.max(5, ...rows.map((r) => r.label.length));
  const portCells = rows.map((r) => formatPortsCell(r.ports));
  const portW = Math.max(5, "PORTS".length, ...portCells.map((c) => c.length));
  const prefixLen = pidW + 2 + ppidW + 2 + envW + 2 + catW + 2 + labelW + 2 + portW + 2;
  const termW = getTerminalWidth(0);
  const commandColW = Math.max(16, termW - prefixLen);
  const lines: string[] = [];
  const hdr =
    `${"PID".padStart(pidW)}  ${"PPID".padStart(ppidW)}  ${"ENV".padEnd(envW)}  ${"CAT".padEnd(catW)}  ${"LABEL".padEnd(labelW)}  ${"PORTS".padEnd(portW)}  COMMAND`;
  lines.push(hdr);
  lines.push("-".repeat(Math.min(termW, Math.max(hdr.length, prefixLen + commandColW))));
  const contIndent = " ".repeat(prefixLen);
  for (const r of rows) {
    const portsCell = formatPortsCell(r.ports).padEnd(portW);
    const catCell = formatCategoriesCell(r.categories).padEnd(catW);
    const prefix = `${String(r.pid).padStart(pidW)}  ${String(r.ppid).padStart(ppidW)}  ${r.env_hint.padEnd(envW)}  ${catCell}  ${r.label.padEnd(labelW)}  ${portsCell}  `;
    const wrapped = wrapCommandForColumn(r.command, commandColW);
    lines.push(prefix + wrapped[0]);
    for (let i = 1; i < wrapped.length; i++) {
      lines.push(contIndent + wrapped[i]);
    }
  }
  lines.push("");
  lines.push(`Total: ${rows.length}`);
  lines.push(
    dim(
      "ENV: dev|prod|mix|? (heuristic from argv + listen ports). CAT: server, mcp, build, orchestrator, tunnel, tooling, other."
    ) + "\n"
  );
  return lines.join("\n");
}

function parsePidList(raw: string): number[] {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const pids: number[] = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Invalid PID token: ${p}`);
    }
    pids.push(n);
  }
  if (pids.length === 0) throw new Error("Provide at least one PID.");
  return pids;
}

function normalizeSignal(name: string): NodeJS.Signals {
  const u = name.trim().toUpperCase().replace(/^SIG/, "");
  if (u === "TERM" || u === "TERMINATE" || u === "SIGTERM") return "SIGTERM";
  if (u === "KILL" || u === "SIGKILL") return "SIGKILL";
  throw new Error(`Unsupported --signal ${name}; use SIGTERM or SIGKILL.`);
}

function promptYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

export function registerProcessesCommands(program: Command, hooks: ProcessesCliHooks): void {
  const proc = program
    .command("processes")
    .description(
      "List or signal local OS processes tied to Neotoma checkouts (ps-based; no HTTP API)."
    );

  proc
    .command("list", { isDefault: true })
    .description("Print a table of Neotoma-related processes (default when no subcommand)")
    .action(async () => {
      const outputMode = hooks.resolveOutputMode();
      try {
        const rows = scanNeotomaProcesses();
        if (outputMode === "json") {
          hooks.writeOutput({ processes: rows }, outputMode);
        } else {
          process.stdout.write(formatTable(rows));
        }
      } catch (err) {
        hooks.writeCliError(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  proc
    .command("servers")
    .description(
      "Table of Neotoma server processes (server role; stack-level ENV/PORT plus LAUNCHAGENT, DATA_DIR, LOGS)"
    )
    .option("--watch", "Refresh the server table until interrupted", false)
    .option(
      "--interval <ms>",
      `Refresh interval in milliseconds for --watch (default ${DEFAULT_SERVERS_WATCH_INTERVAL_MS})`,
      String(DEFAULT_SERVERS_WATCH_INTERVAL_MS)
    )
    .action(async (maybeOpts?: { watch?: boolean; interval?: string } | Command) => {
      const opts =
        typeof (maybeOpts as Command | undefined)?.opts === "function"
          ? (maybeOpts as Command).opts<{ watch?: boolean; interval?: string }>()
          : ((maybeOpts as { watch?: boolean; interval?: string } | undefined) ?? {});
      const outputMode = hooks.resolveOutputMode();
      try {
        if (opts.watch) {
          const intervalMs = parseWatchIntervalMs(opts.interval);
          await runServersWatchLoop({ intervalMs, outputMode });
          return;
        }
        const rows = scanNeotomaProcesses();
        const summaries = buildNeotomaServerSummaries(rows);
        if (outputMode === "json") hooks.writeOutput({ servers: summaries }, outputMode);
        else process.stdout.write(formatServersTable(summaries));
      } catch (err) {
        hooks.writeCliError(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  proc
    .command("kill")
    .description(
      "Signal PIDs that currently classify as Neotoma-related (re-scans ps before signalling)."
    )
    .argument(
      "<pids...>",
      "One or more numeric PIDs (space-separated; commas also allowed inside a quoted token)"
    )
    .option("--dry-run", "Print actions without sending signals", false)
    .option("--force", "Skip confirmation prompt on a TTY", false)
    .option("--signal <name>", "SIGTERM or SIGKILL (default SIGTERM)", "SIGTERM")
    .action(
      async (
        pidsParts: string[],
        opts: { dryRun?: boolean; force?: boolean; signal: string }
      ) => {
        const outputMode = hooks.resolveOutputMode();
        try {
          const want = parsePidList(pidsParts.join(" "));
          const rows = scanNeotomaProcesses();
          const allowed = new Set(rows.map((r) => r.pid));
          const blocked: number[] = [];
          const targets: number[] = [];
          for (const pid of want) {
            if (pid === process.pid) {
              blocked.push(pid);
              continue;
            }
            if (!allowed.has(pid)) {
              blocked.push(pid);
              continue;
            }
            targets.push(pid);
          }
          const sig = normalizeSignal(opts.signal ?? "SIGTERM");
          if (blocked.length > 0) {
            hooks.writeCliError(
              `Refusing PIDs not in the current Neotoma process scan: ${blocked.join(", ")}. Run \`neotoma processes list\` first.`
            );
            process.exitCode = 1;
            return;
          }
          if (targets.length === 0) {
            hooks.writeCliError("No valid PIDs to signal.");
            process.exitCode = 1;
            return;
          }
          if (opts.dryRun) {
            const payload = { dry_run: true, signal: sig, would_signal: targets };
            if (outputMode === "json") {
              hooks.writeOutput(payload, outputMode);
            } else {
              process.stdout.write(
                `Dry run: would send ${sig} to PIDs: ${targets.join(", ")}\n`
              );
            }
            return;
          }
          if (process.stdin.isTTY && !opts.force) {
            const ok = await promptYesNo(
              `Send ${sig} to PIDs ${targets.join(", ")}? [y/N] `
            );
            if (!ok) {
              process.stdout.write("Aborted.\n");
              return;
            }
          } else if (!process.stdin.isTTY && !opts.force) {
            hooks.writeCliError(
              "Not a TTY: re-run with --force to signal without a confirmation prompt."
            );
            process.exitCode = 1;
            return;
          }
          const signalled: number[] = [];
          for (const pid of targets) {
            try {
              process.kill(pid, sig);
              signalled.push(pid);
            } catch (e) {
              hooks.writeCliError(
                `Failed to signal PID ${pid}: ${e instanceof Error ? e.message : String(e)}`
              );
              process.exitCode = 1;
              return;
            }
          }
          if (outputMode === "json") {
            hooks.writeOutput({ ok: true, signal: sig, signalled }, outputMode);
          } else {
            process.stdout.write(`Sent ${sig} to PIDs: ${signalled.join(", ")}\n`);
          }
        } catch (err) {
          hooks.writeCliError(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      }
    );
}
