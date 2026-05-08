import { describe, it, expect } from "vitest";
import {
  classifyNeotomaProcess,
  deriveProcessCategories,
  extractTcpListenPortFromLsofNameField,
  inferProcessEnvHint,
  parseLsofPnOutput,
  parsePsSnapshotForNeotoma,
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
});
