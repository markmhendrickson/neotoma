/**
 * Bind-host behaviour of the standalone MCP WebSocket bridge
 * (`src/mcp_ws_bridge.ts`).
 *
 * The bridge used to create its WebSocketServer with a port and no host, so
 * Node bound it to every network interface. It now binds loopback by default
 * and honours an explicit `NEOTOMA_WS_HOST` opt-in, using the same resolver as
 * the HTTP API's `NEOTOMA_HTTP_HOST` (`src/shared/bind_host.ts`).
 *
 * The listener tests spawn the REAL bridge entry point on an ephemeral port
 * and assert on the address the bound socket reports (`server.address()`, via
 * the startup log line, plus a real TCP connect), never on the options object
 * the script built. Dropping `host` from the server constructor turns the
 * default-loopback test red.
 *
 * Malformed-host behaviour matches the HTTP bind: the value is passed through
 * verbatim, the listen call fails, and the process refuses to start (non-zero
 * exit, no listening socket). It never falls back to a wider bind.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { resolveHttpBindHost } from "../../src/actions.js";
import {
  DEFAULT_BIND_HOST,
  isLoopbackHost,
  resolveBindHostFromEnv,
} from "../../src/shared/bind_host.js";

describe("resolveBindHostFromEnv (shared with the HTTP bind)", () => {
  it("defaults to loopback when unset, empty or whitespace", () => {
    expect(resolveBindHostFromEnv("NEOTOMA_WS_HOST", {})).toBe("127.0.0.1");
    expect(resolveBindHostFromEnv("NEOTOMA_WS_HOST", { NEOTOMA_WS_HOST: "" })).toBe(
      DEFAULT_BIND_HOST
    );
    expect(resolveBindHostFromEnv("NEOTOMA_WS_HOST", { NEOTOMA_WS_HOST: "   " })).toBe(
      DEFAULT_BIND_HOST
    );
  });

  it("honours an explicit value, trimmed", () => {
    expect(resolveBindHostFromEnv("NEOTOMA_WS_HOST", { NEOTOMA_WS_HOST: "  0.0.0.0 " })).toBe(
      "0.0.0.0"
    );
  });

  it("is the same resolver the HTTP API uses", () => {
    expect(resolveHttpBindHost({})).toBe(DEFAULT_BIND_HOST);
    expect(resolveHttpBindHost({ NEOTOMA_HTTP_HOST: "10.0.0.5" })).toBe("10.0.0.5");
  });

  it("classifies loopback spellings", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost(" LOCALHOST ")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
  });
});

describe("src/mcp_ws_bridge.ts real listener", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(testDir, "../..");
  const bridgeEntryPath = path.resolve(repoRoot, "src/mcp_ws_bridge.ts");

  let child: ChildProcessWithoutNullStreams | null = null;

  afterEach(async () => {
    const proc = child;
    child = null;
    if (proc && proc.exitCode === null && !proc.killed) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => proc.kill("SIGKILL"), 2000);
        proc.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        proc.kill("SIGTERM");
      });
    }
  });

  function spawnBridge(wsHost: string | undefined) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NEOTOMA_WS_HOST;
    delete env.WS_PORT;
    if (wsHost !== undefined) env.NEOTOMA_WS_HOST = wsHost;
    env.NEOTOMA_WS_PORT = "0"; // ephemeral port
    // No MCP child is spawned unless a client connects; keep it inert anyway.
    env.NEOTOMA_MCP_CMD = "node";
    env.NEOTOMA_MCP_ARGS = JSON.stringify(["-e", "setInterval(() => {}, 1000)"]);
    // `node --import tsx` (not the tsx CLI wrapper) so child.pid is the real server.
    const proc = spawn(process.execPath, ["--import", "tsx", bridgeEntryPath], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = proc;
    return proc;
  }

  /** Resolve the bound address/port parsed from the startup line. */
  function waitForListening(proc: ChildProcessWithoutNullStreams) {
    return new Promise<{ address: string; port: number }>((resolve, reject) => {
      let out = "";
      const timer = setTimeout(
        () => reject(new Error(`bridge did not report listening within 20s. Output: ${out}`)),
        20000
      );
      proc.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
        const m = out.match(/MCP WebSocket bridge on ws:\/\/(\[[^\]]+\]|[^:/]+):(\d+)\/mcp/);
        if (m) {
          clearTimeout(timer);
          resolve({ address: m[1].replace(/^\[|\]$/g, ""), port: Number(m[2]) });
        }
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
      });
      proc.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`bridge exited early (code ${code}) before listening. Output: ${out}`));
      });
    });
  }

  function canConnect(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect({ host, port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(3000, () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  it("binds loopback only by default", async () => {
    const { address, port } = await waitForListening(spawnBridge(undefined));
    expect(port).toBeGreaterThan(0);
    expect(address).toBe("127.0.0.1");
    expect(await canConnect("127.0.0.1", port)).toBe(true);
  }, 30000);

  it("treats a whitespace-only NEOTOMA_WS_HOST as unset (loopback)", async () => {
    const { address } = await waitForListening(spawnBridge("   "));
    expect(address).toBe("127.0.0.1");
  }, 30000);

  it("honours an explicit NEOTOMA_WS_HOST opt-in", async () => {
    const { address, port } = await waitForListening(spawnBridge("0.0.0.0"));
    expect(address).toBe("0.0.0.0");
    expect(isLoopbackHost(address)).toBe(false);
    expect(await canConnect("127.0.0.1", port)).toBe(true);
  }, 30000);

  it("refuses to start on a malformed host instead of widening the bind", async () => {
    const proc = spawnBridge("not a valid host!!");
    let out = "";
    proc.stdout.on("data", (c: Buffer) => (out += c.toString("utf8")));
    proc.stderr.on("data", (c: Buffer) => (out += c.toString("utf8")));
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`still running after 20s. ${out}`)), 20000);
      proc.once("exit", (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    expect(code).not.toBe(0);
    expect(out).not.toContain("MCP WebSocket bridge on ws://");
    expect(out).toContain("failed to listen");
    // The failure must tell the operator which variables to change.
    expect(out).toContain("NEOTOMA_WS_HOST");
    expect(out).toContain("NEOTOMA_WS_PORT");
  }, 30000);
});
