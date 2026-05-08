/**
 * `neotoma processes list|kill` — local OS process discovery (ps) for Neotoma-related
 * dev servers, MCP stdio shims, and build helpers. Does not call the Neotoma HTTP API.
 */

import { execFileSync } from "node:child_process";
import * as readline from "node:readline";
import type { Command } from "commander";
import { dim, getTerminalWidth } from "../format.js";

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

export type ProcessesCliHooks = {
  resolveOutputMode: () => OutputMode;
  writeOutput: (value: unknown, mode: OutputMode) => void;
  writeCliError: (err: unknown) => void;
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
  const out: NeotomaProcessRow[] = [];
  for (const line of raw.split("\n")) {
    const parsed = parsePsLine(line);
    if (!parsed) continue;
    const label = classifyNeotomaProcess(parsed.args);
    if (!label) continue;
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
  out.sort((a, b) => a.pid - b.pid);
  return out;
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
