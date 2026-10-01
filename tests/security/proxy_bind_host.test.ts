import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { isLoopbackHost, resolveProxyBindHost } from "../../scripts/lib/proxy_bind_host.js";

describe("resolveProxyBindHost", () => {
  it("defaults to loopback when PROXY_HOST is unset", () => {
    expect(resolveProxyBindHost({})).toBe("127.0.0.1");
  });

  it("defaults to loopback when PROXY_HOST is empty or whitespace", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "" })).toBe("127.0.0.1");
    expect(resolveProxyBindHost({ PROXY_HOST: "   " })).toBe("127.0.0.1");
  });

  it("honors an explicit non-loopback PROXY_HOST as a deliberate opt-in", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "0.0.0.0" })).toBe("0.0.0.0");
  });

  it("honors an explicit loopback PROXY_HOST verbatim", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "127.0.0.1" })).toBe("127.0.0.1");
  });

  it("trims surrounding whitespace from an explicit value", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "  0.0.0.0  " })).toBe("0.0.0.0");
  });
});

describe("isLoopbackHost", () => {
  it("recognizes loopback spellings", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("  127.0.0.1  ")).toBe(true);
  });

  it("rejects all-interfaces and other non-loopback hosts", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
    expect(isLoopbackHost("192.168.1.5")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// QA finding 2 (Phoenicurus, PR #2474 review at commit 660885d6): the suite
// above proves `resolveProxyBindHost()` computes the right string, but proves
// nothing about `scripts/dev-proxy.js` actually binding its listeners to
// that string. The reviewer reproduced this by stripping `host` from both
// `.listen()` calls in dev-proxy.js and confirming every assertion above
// still passed.
//
// `scripts/dev-proxy.js` is a standalone top-level script — it runs its
// listen calls as import-time side effects and is not structured as an
// importable module with an exported listen function (unlike
// src/actions.ts, which #2472's tests/security/http_listener_bind_host.test.ts
// exercises directly via its exported `tryListen`). So the only way to
// exercise the real listen wiring here is to run the actual script as a
// child process and read back the REAL bound socket — not the options
// object the script constructed, which is exactly what would stay green if
// `host` were silently dropped.
//
// The real bound address is read via `lsof -iTCP -sTCP:LISTEN`, which
// reports the kernel's view of the socket (loopback shows as
// `127.0.0.1:<port>`; all-interfaces shows as `*:<port>` for IPv4). This
// deliberately does not parse the script's own stdout log line, since that
// line is derived from the same `PROXY_HOST` variable the fix is supposed
// to thread into `.listen()` — asserting against it would be exactly the
// options-object-shaped test the reviewer rejected.
// ---------------------------------------------------------------------------
describe("scripts/dev-proxy.js — real listen-socket bind (finding 2, unguarded listen wiring)", () => {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const devProxyPath = path.resolve(scriptsDir, "../../scripts/dev-proxy.js");

  let child: ChildProcessWithoutNullStreams | null = null;

  afterEach(async () => {
    if (child && child.exitCode === null && !child.killed) {
      const proc = child;
      await new Promise<void>((resolve) => {
        proc.once("exit", () => resolve());
        proc.kill("SIGTERM");
        // Belt-and-suspenders: if the script ever stops handling SIGTERM
        // gracefully, do not leak a listener across tests.
        setTimeout(() => {
          if (proc.exitCode === null && !proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 2000).unref();
      });
    }
    child = null;
  });

  /**
   * Spawns scripts/dev-proxy.js with an ephemeral HTTP port (PROXY_HTTP_PORT=0)
   * and HTTPS disabled (no .dev-certs present in a clean checkout, and this
   * test does not need the HTTPS listener), waits for its startup log line,
   * then asks the OS — via `lsof` — what the process actually bound.
   */
  async function spawnDevProxyAndReadBoundSocket(env: NodeJS.ProcessEnv): Promise<{
    address: string | null;
    port: number | null;
  }> {
    child = spawn(process.execPath, [devProxyPath], {
      env: {
        ...process.env,
        ...env,
        PROXY_HTTP_PORT: "0",
        PROXY_HTTPS_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const startedUp = new Promise<void>((resolve, reject) => {
      let out = "";
      const onData = (chunk: Buffer) => {
        out += chunk.toString("utf8");
        if (out.includes("[dev-proxy] HTTP reverse proxy listening")) {
          child?.stdout.off("data", onData);
          resolve();
        }
      };
      child?.stdout.on("data", onData);
      child?.once("error", reject);
      child?.once("exit", (code) => {
        reject(
          new Error(
            `dev-proxy.js exited early (code ${code}) before it reported listening. Output: ${out}`
          )
        );
      });
      setTimeout(
        () =>
          reject(
            new Error(`dev-proxy.js did not report listening within 5s. Output so far: ${out}`)
          ),
        5000
      ).unref();
    });

    await startedUp;

    if (!child.pid) {
      throw new Error("dev-proxy.js child process has no pid");
    }

    // Read the REAL bound socket from the kernel, not from the script's own
    // options object or log line. `-Pn` avoids DNS/service-name lookups so
    // the output is a raw "host:port" (or "*:port" for all-interfaces).
    const lsofOutput = execFileSync(
      "lsof",
      ["-a", "-p", String(child.pid), "-iTCP", "-sTCP:LISTEN", "-Pn"],
      { encoding: "utf8" }
    );

    const listenLine = lsofOutput.split("\n").find((line) => line.includes("LISTEN"));

    if (!listenLine) {
      return { address: null, port: null };
    }

    // lsof NAME column is e.g. "127.0.0.1:52706" or "*:53017" (IPv4) or
    // "[::1]:52706" / "*:53017" (IPv6-capable builds also print bracketed
    // forms). Extract the final ":<port>" and treat everything before it as
    // the address.
    const nameMatch = listenLine.match(/(\S+):(\d+)\s*\(LISTEN\)\s*$/);
    if (!nameMatch) {
      return { address: null, port: null };
    }
    const [, rawAddress, rawPort] = nameMatch;
    const address = rawAddress === "*" ? "0.0.0.0" : rawAddress.replace(/^\[|\]$/g, "");
    return { address, port: Number(rawPort) };
  }

  it("defaults to a loopback-only bind, verified from the real socket (not the listen-options object)", async () => {
    const { address, port } = await spawnDevProxyAndReadBoundSocket({ PROXY_HOST: undefined });

    expect(port).toBeGreaterThan(0);
    // This is the assertion that goes RED if `host` is dropped from
    // `httpListenOptions` in scripts/dev-proxy.js: Node's own default with
    // no host is all-interfaces, so the real socket would report
    // "0.0.0.0"/"::" instead of "127.0.0.1".
    expect(isLoopbackHost(address ?? "")).toBe(true);
    expect(address).toBe("127.0.0.1");
  });

  it("binds all interfaces when PROXY_HOST=0.0.0.0 is an explicit opt-in", async () => {
    const { address, port } = await spawnDevProxyAndReadBoundSocket({ PROXY_HOST: "0.0.0.0" });

    expect(port).toBeGreaterThan(0);
    expect(address).toBe("0.0.0.0");
    expect(isLoopbackHost(address ?? "")).toBe(false);
  });
});
