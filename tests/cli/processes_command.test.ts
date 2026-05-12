import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildNeotomaServerSummaries,
  classifyNeotomaProcess,
  deriveProcessCategories,
  extractInlineEnvAssignment,
  extractTcpListenPortFromLsofNameField,
  filterNeotomaServerRows,
  formatServersWatchSnapshot,
  inferLaunchAgentLabel,
  formatListenPortsForServers,
  inferIsProductionForLogs,
  inferLaunchdCell,
  inferProcessEnvHint,
  parseLsofPnOutput,
  parseProcEnvironBuffer,
  parsePsSnapshotForNeotoma,
  parsePsSnapshotNodes,
  parseWatchIntervalMs,
  resolveNeotomaServerLogPaths,
  shortNeotomaEnvLabel,
  wrapCommandForColumn,
} from "../../src/cli/commands/processes.js";

describe("neotoma processes classifier", () => {
  it("classifies main repo tsx watch", () => {
    expect(
      classifyNeotomaProcess(
        "node /Users/x/repos/neotoma/node_modules/.bin/tsx watch src/actions.ts"
      )
    ).toBe("api_watcher");
  });

  it("classifies hotfix tsx watch", () => {
    expect(
      classifyNeotomaProcess(
        "node /Users/x/repos/neotoma-hotfix-0.9.1/node_modules/.bin/tsx watch src/actions.ts"
      )
    ).toBe("hotfix_watcher");
  });

  it("classifies run-dev-task without repo path in argv", () => {
    expect(
      classifyNeotomaProcess("node scripts/run-dev-task.js tsx watch src/actions.ts")
    ).toBe("run_dev_task");
  });

  it("classifies run-dev-task with Node native watch (launchd-friendly)", () => {
    expect(
      classifyNeotomaProcess(
        "node scripts/run-dev-task.js node --watch-path=src --watch-preserve-output --import tsx src/actions.ts"
      )
    ).toBe("run_dev_task");
  });

  it("classifies run-neotoma-api-node-watch shell entry", () => {
    expect(
      classifyNeotomaProcess("bash /Users/u/repos/neotoma/scripts/run-neotoma-api-node-watch.sh")
    ).toBe("run_dev_task");
  });

  it("classifies MCP stdio shim", () => {
    expect(
      classifyNeotomaProcess(
        "/bin/sh /Users/x/repos/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
      )
    ).toBe("mcp_stdio");
  });

  it("classifies prod server chain patterns", () => {
    expect(
      classifyNeotomaProcess(
        "node /Users/x/repos/neotoma/node_modules/.bin/cross-env NEOTOMA_ENV=production npm run start:server"
      )
    ).toBe("prod_server");
    expect(classifyNeotomaProcess("node dist/actions.js")).toBe("prod_server");
    expect(classifyNeotomaProcess("npm run start:server:prod")).toBe("prod_server");
    expect(classifyNeotomaProcess("npm run start:server")).toBe("prod_server");
  });

  it("parsePsSnapshotForNeotoma inherits classification to children of classified PIDs", () => {
    const raw = `
42774     1 npm run start:server:prod
42881 42774 sh -c npm run build:server && node scripts/pick-port.js 3180 -- cross-env NEOTOMA_ENV=production npm run start:server
43202 42881 node scripts/pick-port.js 3180 -- cross-env NEOTOMA_ENV=production npm run start:server
43254 43202 node dist/actions.js
`;
    const rows = parsePsSnapshotForNeotoma(raw);
    const pids = rows.map((r) => r.pid).sort((a, b) => a - b);
    expect(pids).toContain(42774);
    expect(pids).toContain(42881);
    expect(pids).toContain(43202);
    expect(pids).toContain(43254);
    expect(rows.find((r) => r.pid === 43254)?.label).toBe("prod_server");
    expect(rows.find((r) => r.pid === 43254)?.categories).toContain("server");
    expect(rows.find((r) => r.pid === 42881)?.categories).toContain("server");
  });

  it("returns null for unrelated grep", () => {
    expect(classifyNeotomaProcess("grep foo /var/log/syslog")).toBe(null);
  });

  it("wrapCommandForColumn prefers word breaks", () => {
    const cmd = "node /very/long/path/to/repo/node_modules/.bin/tsx watch src/actions.ts";
    const lines = wrapCommandForColumn(cmd, 40);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 40)).toBe(true);
    expect(lines.join(" ")).toContain("tsx");
  });

  it("wrapCommandForColumn hard-breaks tokens longer than width", () => {
    const lines = wrapCommandForColumn("abcdefghijklmnop", 6);
    expect(lines).toEqual(["abcdef", "ghijkl", "mnop"]);
  });

  it("parses ps snapshot fixture", () => {
    const raw = `
 111   1 node /Users/me/repos/neotoma/node_modules/.bin/tsx watch src/actions.ts
 222 111 node scripts/run-dev-task.js tsx watch src/actions.ts
 333   1 /bin/sh /Users/me/repos/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh
`;
    const rows = parsePsSnapshotForNeotoma(raw);
    expect(rows.map((r) => r.pid).sort((a, b) => a - b)).toEqual([111, 222, 333]);
    expect(rows.find((r) => r.pid === 111)?.label).toBe("api_watcher");
    expect(rows.find((r) => r.pid === 222)?.label).toBe("run_dev_task");
    expect(rows.find((r) => r.pid === 333)?.label).toBe("mcp_stdio");
    expect(rows.every((r) => Array.isArray(r.ports) && r.ports.length === 0)).toBe(true);
    expect(rows.find((r) => r.pid === 111)?.categories).toContain("server");
    expect(rows.find((r) => r.pid === 333)?.env_hint).toBe("prod");
  });

  it("inferProcessEnvHint prefers prod argv and dev ports", () => {
    expect(
      inferProcessEnvHint(
        "node scripts/pick-port.js --print-resources 3180 5295 3101 -- cross-env NEOTOMA_ENV=production npx concurrently",
        []
      )
    ).toBe("prod");
    expect(inferProcessEnvHint("node scripts/run_dev_servers_launchd.sh", [])).toBe("dev");
    expect(inferProcessEnvHint("node /x/tsx watch src/actions.ts", [3080, 3180])).toBe("mix");
    expect(inferProcessEnvHint("node /x/tsx watch src/actions.ts", [3080])).toBe("dev");
    expect(inferProcessEnvHint("node /x/tsx watch src/actions.ts", [])).toBe("?");
  });

  it("deriveProcessCategories adds tunnel tag when ngrok appears", () => {
    expect(deriveProcessCategories("api_orchestrator", "npx concurrently setup-https-tunnel")).toEqual([
      "orchestrator",
      "tunnel",
    ]);
    expect(deriveProcessCategories("mcp_proxy", "tsx src/cli/index.ts mcp proxy")).toEqual(["mcp"]);
  });

  it("extractTcpListenPortFromLsofNameField parses common lsof -F n shapes", () => {
    expect(extractTcpListenPortFromLsofNameField("*:3080")).toBe(3080);
    expect(extractTcpListenPortFromLsofNameField("127.0.0.1:18080")).toBe(18080);
    expect(extractTcpListenPortFromLsofNameField("[::1]:9999")).toBe(9999);
    expect(extractTcpListenPortFromLsofNameField("nonsense")).toBe(null);
  });

  it("parseLsofPnOutput groups n lines under current p", () => {
    const raw = `p100
f14
n*:3080
n*:3081
p200
n127.0.0.1:18080
`;
    const m = parseLsofPnOutput(raw);
    expect([...(m.get(100) ?? [])].sort((a, b) => a - b)).toEqual([3080, 3081]);
    expect([...(m.get(200) ?? [])]).toEqual([18080]);
  });

  it("parseProcEnvironBuffer splits NUL-separated KEY=value pairs", () => {
    const buf = Buffer.from("NEOTOMA_ENV=development\0NEOTOMA_DATA_DIR=/tmp/neotoma-data\0", "utf8");
    const m = parseProcEnvironBuffer(buf);
    expect(m.get("NEOTOMA_ENV")).toBe("development");
    expect(m.get("NEOTOMA_DATA_DIR")).toBe("/tmp/neotoma-data");
  });

  it("extractInlineEnvAssignment finds cross-env style tokens", () => {
    const cmd = "node scripts/pick-port.js cross-env NEOTOMA_ENV=production node dist/actions.js";
    expect(extractInlineEnvAssignment(cmd, "NEOTOMA_ENV")).toBe("production");
    expect(extractInlineEnvAssignment(cmd, "NEOTOMA_DATA_DIR")).toBeUndefined();
  });

  it("shortNeotomaEnvLabel normalizes common values", () => {
    expect(shortNeotomaEnvLabel("development")).toBe("dev");
    expect(shortNeotomaEnvLabel("production")).toBe("prod");
    expect(shortNeotomaEnvLabel("staging")).toBe("staging");
  });

  it("inferLaunchdCell marks macOS launchd scripts and PPID 1", () => {
    expect(inferLaunchdCell("darwin", 1, "node /x/tsx watch")).toBe("yes");
    expect(inferLaunchdCell("darwin", 2, "bash run_dev_servers_launchd.sh")).toBe("yes");
    expect(inferLaunchdCell("darwin", 2, "node /Users/x/Library/LaunchAgents/foo.plist")).toBe(
      "yes"
    );
    expect(inferLaunchdCell("darwin", 99, "node /x/tsx watch")).toBe("no");
    expect(inferLaunchdCell("linux", 1, "node")).toBe("-");
  });

  it("inferLaunchAgentLabel resolves launchd ancestry and plist labels", () => {
    const psIndex = new Map(
      parsePsSnapshotNodes(`
48050     1 npm run dev:server
66050 48050 node /Users/me/repos/neotoma/scripts/run_neotoma_api_chokidar_poll_watch.js src/actions.ts
57148 66050 /usr/local/bin/node /Users/me/repos/neotoma/scripts/run-dev-task.js node --import tsx /Users/me/repos/neotoma/src/actions.ts
57159 57148 node --import tsx /Users/me/repos/neotoma/src/actions.ts
77777     1 node /Users/me/Library/LaunchAgents/com.neotoma.watch-build.plist
`)
        .map((node) => [node.pid, node])
    );
    expect(
      inferLaunchAgentLabel(
        "darwin",
        57159,
        57148,
        "node --import tsx /Users/me/repos/neotoma/src/actions.ts",
        psIndex
      )
    ).toBe("com.neotoma.dev-server");
    expect(
      inferLaunchAgentLabel(
        "darwin",
        77777,
        1,
        "node /Users/me/Library/LaunchAgents/com.neotoma.watch-build.plist",
        psIndex
      )
    ).toBe("com.neotoma.watch-build");
    expect(inferLaunchAgentLabel("linux", 57159, 57148, "node", psIndex)).toBe("-");
  });

  it("filterNeotomaServerRows keeps all server-category rows regardless of port", () => {
    const rows = [
      {
        pid: 1,
        ppid: 0,
        label: "mcp_stdio",
        command: "sh run_neotoma_mcp_stdio.sh",
        ports: [],
        env_hint: "dev",
        categories: ["mcp"],
      },
      {
        pid: 2,
        ppid: 1,
        label: "api_watcher",
        command: "tsx watch src/actions.ts",
        ports: [3080],
        env_hint: "dev",
        categories: ["server"],
      },
      {
        pid: 3,
        ppid: 1,
        label: "api_watcher",
        command: "tsx watch src/actions.ts",
        ports: [5295],
        env_hint: "dev",
        categories: ["server"],
      },
    ] as const;
    const f = filterNeotomaServerRows(rows as never);
    expect(f.map((r) => r.pid)).toEqual([2, 3]);
  });

  it("formatListenPortsForServers puts default API ports first then sorts the rest", () => {
    expect(formatListenPortsForServers([5295, 3080, 18080])).toBe("3080,5295,18080");
    expect(formatListenPortsForServers([])).toBe("-");
  });

  it("parseWatchIntervalMs defaults to three seconds and rejects too-small values", () => {
    expect(parseWatchIntervalMs(undefined)).toBe(3000);
    expect(parseWatchIntervalMs("5000")).toBe(5000);
    expect(() => parseWatchIntervalMs("249")).toThrow("Invalid --interval");
    expect(() => parseWatchIntervalMs("abc")).toThrow("Invalid --interval");
  });

  it("formatServersWatchSnapshot shows refresh cadence and timestamp", () => {
    const out = formatServersWatchSnapshot(
      [
        {
          pid: 42,
          neotoma_env: "dev",
          port: "3080",
          launchagent: "-",
          data_dir: "/tmp/neotoma",
          log_paths: ["/tmp/neotoma/logs/events.log"],
        },
      ],
      { intervalMs: 3000, refreshedAt: new Date("2026-05-11T13:45:00.000Z") }
    );
    expect(out).toContain("Updated 2026-05-11 13:45:00Z.");
    expect(out).toContain("Refreshing every 3s.");
    expect(out).toContain("Press Ctrl+C to exit.");
    expect(out).toContain("3080");
  });

  it("buildNeotomaServerSummaries inherits stack env, ports, data dir, and launchagent", () => {
    const summaries = buildNeotomaServerSummaries([
      {
        pid: 10,
        ppid: 1,
        label: "api_watcher",
        command: "NEOTOMA_ENV=development NEOTOMA_DATA_DIR=/data/dev node",
        ports: [5295, 3080, 3180],
        env_hint: "?",
        categories: ["server"],
      },
      {
        pid: 11,
        ppid: 10,
        label: "actions_worker",
        command: "node /Users/me/repos/neotoma/src/actions.ts",
        ports: [],
        env_hint: "?",
        categories: ["server"],
      },
    ] as never, {
      psSnapshotRaw: `
10     1 npm run dev:server
11    10 node /Users/me/repos/neotoma/src/actions.ts
`,
    });
    // Stack dedup: parent+child form one connected component → one summary row
    expect(summaries).toHaveLength(1);
    expect(summaries[0].port).toBe("3080,3180,5295");
    expect(summaries[0].neotoma_env).toBe("dev");
    expect(summaries[0].data_dir).toBe("/data/dev");
    expect(summaries[0].launchagent).toBe("com.neotoma.dev-server");
    expect(summaries[0].log_paths.length).toBeGreaterThan(0);
    expect(summaries[0].log_paths.some((p) => p.includes("events.log"))).toBe(true);
    expect(summaries[0].log_paths.some((p) => p.includes("api.log"))).toBe(true);
  });

  it("inferIsProductionForLogs prefers explicit env and listen port", () => {
    const m = new Map<string, string>([["NEOTOMA_ENV", "production"]]);
    expect(inferIsProductionForLogs(m, "", "?", [])).toBe(true);
    expect(inferIsProductionForLogs(null, "", "?", [3180])).toBe(true);
    expect(inferIsProductionForLogs(null, "", "?", [3080])).toBe(false);
  });

  it("resolveNeotomaServerLogPaths includes event log and background api log", () => {
    const paths = resolveNeotomaServerLogPaths({
      envMap: null,
      command: "",
      neotoma_env: "dev",
      ports: [3080],
      data_dir: "/tmp/neotoma-d",
    });
    expect(paths.some((p) => p.endsWith(path.join("logs", "events.log")))).toBe(true);
    expect(paths.some((p) => p.includes("api.log"))).toBe(true);
  });
});
