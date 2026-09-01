import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contract tests over the repo-owned Fly deploy configuration.
 *
 * Motivated by neotoma#2279: a deploy run from a stale checkout reapplied that
 * checkout's `[[vm]]` block over the operator's production machine, taking it
 * from performance/8GB to shared-cpu-1x/1GB and dropping its health check —
 * from slow to unreachable for ~30 minutes, with `flyctl status` still
 * reporting `started` and `flyctl machine restart` printing "No health checks
 * found."
 *
 * Two things follow, and both are asserted here rather than left to review:
 *
 *   1. No Fly config may declare a guest small enough to OOM Node on boot.
 *      `flyctl deploy` overwrites the running guest without merging and
 *      without warning when it shrinks one.
 *   2. Every config must carry a check, and that check must exercise a real
 *      read. `/health` reads package.json off disk and answers 200 during a
 *      total database outage, so a check pointed at it reports success while
 *      producing nothing.
 *
 * The assertions are about parsed VALUES, not TOML syntax validity — a file
 * that parses cleanly and declares the wrong machine is exactly the bug.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The readiness path that performs a real bounded database read
 * (`GET /ready` in src/actions.ts). Checks must point here.
 */
const READINESS_PATH = "/ready";

/** Liveness-only. Returns 200 with the database wedged; never a check target. */
const LIVENESS_ONLY_PATH = "/health";

/**
 * Node's default old-space ceiling is ~2GB. A machine with less RAM than that
 * puts the V8 limit above available memory, so the process is killed rather
 * than GC'd under load (neotoma#2094).
 */
const MIN_MEMORY_MB = 2048;

/**
 * Production instances were measured answering in 13-24s while serving
 * correctly under load on 2026-09-01. A check timeout below this marks a
 * working server dead; with `min_machines_running = 1` that removes the only
 * machine from rotation, turning slowness into an outage.
 */
const MIN_CHECK_TIMEOUT_SECONDS = 25;

type TomlValue = string | number | boolean;
type TomlTable = { [key: string]: TomlValue | TomlTable | TomlTable[] };

/**
 * Minimal TOML reader covering the subset Fly configs use: top-level key/value
 * pairs, `[table]`, `[table.sub]`, `[[array_of_tables]]`, comments, and
 * single/double-quoted strings, integers and booleans.
 *
 * Deliberately dependency-free. Adding a TOML parser to the production
 * dependency tree to ship one config test is a worse trade than sixty lines
 * that only have to understand files this repo owns.
 */
function parseSimpleToml(source: string): TomlTable {
  const root: TomlTable = {};
  let current: TomlTable = root;

  const descend = (segments: string[], asArrayElement: boolean): TomlTable => {
    let node: TomlTable = root;
    for (let i = 0; i < segments.length; i += 1) {
      const key = segments[i];
      const isLast = i === segments.length - 1;

      if (isLast && asArrayElement) {
        const existing = node[key];
        const bucket = Array.isArray(existing) ? (existing as TomlTable[]) : [];
        const created: TomlTable = {};
        bucket.push(created);
        node[key] = bucket;
        return created;
      }

      let child = node[key];
      if (Array.isArray(child)) {
        child = (child as TomlTable[])[child.length - 1];
      }
      if (typeof child !== "object" || child === null) {
        child = {} as TomlTable;
        node[key] = child as TomlTable;
      }
      node = child as TomlTable;
    }
    return node;
  };

  const parseScalar = (raw: string): TomlValue => {
    const value = raw.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
    return value;
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/(^|\s)#.*$/, "").trim();
    if (!line) continue;

    const arrayTable = /^\[\[(.+)\]\]$/.exec(line);
    if (arrayTable) {
      current = descend(
        arrayTable[1].split(".").map((s) => s.trim()),
        true
      );
      continue;
    }

    const table = /^\[(.+)\]$/.exec(line);
    if (table) {
      current = descend(
        table[1].split(".").map((s) => s.trim()),
        false
      );
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1) continue;
    current[line.slice(0, eq).trim()] = parseScalar(line.slice(eq + 1));
  }

  return root;
}

function readFlyConfig(fileName: string): TomlTable {
  return parseSimpleToml(fs.readFileSync(path.join(REPO_ROOT, fileName), "utf-8"));
}

/** Every `fly*.toml` at the repo root, so a new one cannot slip past unasserted. */
function listFlyConfigs(): string[] {
  return fs
    .readdirSync(REPO_ROOT)
    .filter((name) => /^fly.*\.toml$/.test(name))
    .sort();
}

/** `'2gb'` / `'512mb'` / `4096` → megabytes. */
function memoryToMb(raw: TomlValue): number {
  if (typeof raw === "number") return raw;
  const text = String(raw).trim().toLowerCase();
  const amount = Number.parseFloat(text);
  if (Number.isNaN(amount)) return Number.NaN;
  return text.endsWith("gb") ? amount * 1024 : amount;
}

/** `'30s'` / `'2m'` → seconds. */
function durationToSeconds(raw: TomlValue): number {
  const text = String(raw).trim().toLowerCase();
  const amount = Number.parseFloat(text);
  if (Number.isNaN(amount)) return Number.NaN;
  if (text.endsWith("ms")) return amount / 1000;
  if (text.endsWith("m")) return amount * 60;
  if (text.endsWith("h")) return amount * 3600;
  return amount;
}

function httpServiceOf(config: TomlTable): TomlTable {
  return (config.http_service as TomlTable) ?? {};
}

function checksOf(config: TomlTable): TomlTable[] {
  return (httpServiceOf(config).checks as TomlTable[]) ?? [];
}

function vmsOf(config: TomlTable): TomlTable[] {
  return (config.vm as TomlTable[]) ?? [];
}

describe("fly_deploy_config.all_configs", () => {
  const configs = listFlyConfigs();

  it("finds the Fly configs this suite is meant to cover", () => {
    // A bare directory read means a newly added fly*.toml is automatically
    // subject to every assertion below, rather than silently uncovered.
    expect(configs).toContain("fly.toml");
    expect(configs.length).toBeGreaterThanOrEqual(2);
  });

  it.each(listFlyConfigs())("%s declares a guest large enough for Node's heap", (fileName) => {
    const vms = vmsOf(readFlyConfig(fileName));
    expect(vms.length, `${fileName} must declare [[vm]] explicitly`).toBeGreaterThan(0);

    for (const vm of vms) {
      expect(
        memoryToMb(vm.memory),
        `${fileName} declares ${String(vm.memory)}; a deploy reapplies this over the running ` +
          `machine and Node's ~2GB heap ceiling would sit above available RAM`
      ).toBeGreaterThanOrEqual(MIN_MEMORY_MB);
    }
  });

  it.each(listFlyConfigs())("%s defines at least one health check", (fileName) => {
    // "No health checks found" is what `flyctl machine restart` printed
    // throughout the 2026-09-01 outage. An empty check set means Fly cannot
    // tell a serving machine from a wedged one.
    expect(
      checksOf(readFlyConfig(fileName)).length,
      `${fileName} declares no health check`
    ).toBeGreaterThan(0);
  });

  it.each(listFlyConfigs())("%s checks a real read, not process liveness", (fileName) => {
    for (const check of checksOf(readFlyConfig(fileName))) {
      expect(
        check.path,
        `${fileName} checks ${LIVENESS_ONLY_PATH}, which answers 200 with the database ` +
          `wedged — it would report health through a total read outage`
      ).not.toBe(LIVENESS_ONLY_PATH);
      expect(check.path).toBe(READINESS_PATH);
      expect(check.method).toBe("GET");
    }
  });

  it.each(listFlyConfigs())("%s tolerates a slow-but-alive server", (fileName) => {
    for (const check of checksOf(readFlyConfig(fileName))) {
      expect(
        durationToSeconds(check.timeout),
        `${fileName} would flap against a loaded instance answering in 13-24s`
      ).toBeGreaterThanOrEqual(MIN_CHECK_TIMEOUT_SECONDS);

      // A grace period shorter than boot marks a starting machine unhealthy:
      // the [deploy] release_command seeds schemas and migrations run before
      // the server listens.
      expect(durationToSeconds(check.grace_period)).toBeGreaterThanOrEqual(60);
      expect(durationToSeconds(check.interval)).toBeGreaterThan(0);
    }
  });

  it.each(listFlyConfigs())("%s routes to the port the server listens on", (fileName) => {
    const config = readFlyConfig(fileName);
    const env = (config.env as TomlTable) ?? {};
    expect(httpServiceOf(config).internal_port).toBe(3180);
    expect(env.NEOTOMA_HTTP_PORT).toBe("3180");
  });
});

describe("fly_deploy_config.shared_default", () => {
  const config = readFlyConfig("fly.toml");

  it("names no app, so a bare deploy fails instead of mis-targeting one", () => {
    // Restored by #2013 and asserted here so it cannot regress: with an `app`
    // key, `flyctl deploy` in this repo silently succeeds against whichever
    // app the file happens to name.
    expect(config.app).toBeUndefined();
  });

  it("keeps one machine warm rather than scaling to zero", () => {
    const httpService = httpServiceOf(config);
    // MCP-over-HTTP sessions live in process memory, so a stop invalidates
    // every live session and clients cannot self-recover (neotoma#2100).
    expect(httpService.min_machines_running).toBe(1);
    expect(httpService.auto_stop_machines).toBe("off");
  });

  it("restarts on a clean exit, which on-failure ignores by definition", () => {
    // The server exits 0 periodically (neotoma#2094); under the default
    // `on-failure` the machine stays stopped until a request wakes it.
    const restarts = (config.restart as TomlTable[]) ?? [];
    expect(restarts.length).toBeGreaterThan(0);
    expect(restarts[0].policy).toBe("always");
  });
});

describe("fly_deploy_config.regression_2279", () => {
  // The exact shape that was deployed over production on 2026-09-01.
  const DEPLOYED_DOWNGRADE = `
app = 'neotoma-sandbox'

[http_service]
  internal_port = 3180
  auto_stop_machines = 'stop'
  min_machines_running = 0

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
`;

  const parsed = parseSimpleToml(DEPLOYED_DOWNGRADE);

  it("would be rejected on every count the contract checks", () => {
    // Asserted individually so a partial regression is still caught rather
    // than passing because some other clause happens to fail first.
    expect(memoryToMb(vmsOf(parsed)[0].memory)).toBeLessThan(MIN_MEMORY_MB);
    expect(checksOf(parsed)).toHaveLength(0);
    expect(httpServiceOf(parsed).min_machines_running).toBe(0);
    expect(httpServiceOf(parsed).auto_stop_machines).toBe("stop");
    expect(parsed.app).toBeDefined();
  });

  it("no longer describes any config in the repo", () => {
    for (const fileName of listFlyConfigs()) {
      const config = readFlyConfig(fileName);
      expect(memoryToMb(vmsOf(config)[0].memory)).toBeGreaterThanOrEqual(MIN_MEMORY_MB);
      expect(checksOf(config).length).toBeGreaterThan(0);
    }
  });
});
