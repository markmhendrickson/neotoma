/**
 * Regression coverage for the HTTP listener bind-host defect.
 *
 * Two bugs, one fix:
 *
 *   1. `tryListen()` called `app.listen(port, cb)` with no host argument, so
 *      Node bound the socket to all interfaces (0.0.0.0/::) regardless of
 *      operator intent.
 *   2. `NEOTOMA_HTTP_HOST` was read to compute the boot-time sandbox-mode
 *      posture (`loopbackBindOnly`) but was never forwarded to `listen()`,
 *      so the reported posture could say "loopback-only" while the actual
 *      socket was open on every interface.
 *
 * What this proves:
 *
 *   - `resolveHttpBindHost()` defaults to `127.0.0.1` and only returns a
 *     non-loopback value when `NEOTOMA_HTTP_HOST` is explicitly set.
 *   - `tryListen()` actually binds to the host it is given — asserted via
 *     `server.address()` after a real bind, not by inspecting call args.
 *   - The default call path (no explicit host) binds loopback-only.
 *   - An explicit opt-in (`NEOTOMA_HTTP_HOST=0.0.0.0`) still binds all
 *     interfaces, so tunnel/remote deployments are not broken by the new
 *     default.
 */

import type { AddressInfo } from "node:net";
import { describe, it, expect, afterEach } from "vitest";
import { tryListen, resolveHttpBindHost, isLoopbackHost } from "../../src/actions.js";

describe("resolveHttpBindHost", () => {
  it("defaults to loopback when NEOTOMA_HTTP_HOST is unset", () => {
    expect(resolveHttpBindHost({} as NodeJS.ProcessEnv)).toBe("127.0.0.1");
    expect(resolveHttpBindHost({ NEOTOMA_HTTP_HOST: "" } as NodeJS.ProcessEnv)).toBe("127.0.0.1");
  });

  it("honors an explicit NEOTOMA_HTTP_HOST as an opt-in", () => {
    expect(resolveHttpBindHost({ NEOTOMA_HTTP_HOST: "0.0.0.0" } as NodeJS.ProcessEnv)).toBe(
      "0.0.0.0"
    );
    expect(resolveHttpBindHost({ NEOTOMA_HTTP_HOST: "10.0.0.5" } as NodeJS.ProcessEnv)).toBe(
      "10.0.0.5"
    );
  });
});

describe("isLoopbackHost", () => {
  it("recognizes loopback spellings", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
  });

  it("rejects non-loopback hosts", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("10.0.0.5")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
  });
});

describe("tryListen — actual bind address (regression for silent all-interfaces bind)", () => {
  let activeServer: Awaited<ReturnType<typeof tryListen>>["server"] | null = null;

  afterEach(async () => {
    if (activeServer) {
      await new Promise<void>((resolve) => activeServer!.close(() => resolve()));
      activeServer = null;
    }
  });

  it("binds to 127.0.0.1 by default (port 0 = ephemeral)", async () => {
    const { server, port } = await tryListen(0, resolveHttpBindHost({} as NodeJS.ProcessEnv));
    activeServer = server;

    const addr = server.address() as AddressInfo;
    // This is the assertion that fails on pre-fix code: prior to the fix,
    // tryListen(port) took no host argument at all, so `app.listen(port, cb)`
    // bound to `::` (all interfaces) and this would read "::" instead.
    expect(addr.address).toBe("127.0.0.1");
    expect(port).toBeGreaterThan(0);
    expect(port).toBe(addr.port);
  });

  it("still binds all interfaces when NEOTOMA_HTTP_HOST=0.0.0.0 is explicit opt-in", async () => {
    const host = resolveHttpBindHost({ NEOTOMA_HTTP_HOST: "0.0.0.0" } as NodeJS.ProcessEnv);
    expect(host).toBe("0.0.0.0");

    const { server } = await tryListen(0, host);
    activeServer = server;

    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe("0.0.0.0");
  });

  it("preserves ephemeral-port readback (port 0 -> OS-assigned port)", async () => {
    const { server, port } = await tryListen(0, "127.0.0.1");
    activeServer = server;

    // port 0 is a request for an OS-assigned ephemeral port; callers (the
    // eval harness writing NEOTOMA_SESSION_PORT_FILE) depend on getting the
    // real bound port back, not the literal 0 that was passed in.
    expect(port).not.toBe(0);
    expect(port).toBe((server.address() as AddressInfo).port);
  });
});
