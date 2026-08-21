import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { formatLiveApiUnavailableMessage, probeLiveApi } from "./support/live_api_probe.ts";

/**
 * Effect test for issue #2052: when no live API is listening, the probe path
 * completes in well under Vitest's global 60000ms testTimeout and emits the
 * UX-specified message shape (port + env names + next action) — proving the
 * hang→fast-clear-failure effect, not merely that probeLiveApi returns a value.
 */
describe("live_api_probe (effect: no hang to suite testTimeout)", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = undefined;
    }
  });

  it("closed-port probe finishes in ≪60s and message matches UX shape (no secrets)", async () => {
    // Bind-and-close to obtain a port that is guaranteed free (connection refused).
    const binder = net.createServer();
    const freePort: number = await new Promise((resolve, reject) => {
      binder.once("error", reject);
      binder.listen(0, "127.0.0.1", () => {
        const address = binder.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
    await new Promise<void>((resolve) => binder.close(() => resolve()));

    const baseUrl = `http://127.0.0.1:${freePort}`;
    const start = Date.now();
    const result = await probeLiveApi(baseUrl);
    const elapsedMs = Date.now() - start;

    expect(result.reachable).toBe(false);
    if (result.reachable) {
      throw new Error("unreachable");
    }
    expect(elapsedMs).toBeLessThan(2000);

    const message = formatLiveApiUnavailableMessage(baseUrl, result.reason);
    expect(message).toContain(String(freePort));
    expect(message).toContain("NEOTOMA_SESSION_DEV_PORT");
    expect(message).toContain("NEOTOMA_HTTP_PORT");
    expect(message).toMatch(/integration lane|Start the local server/i);
    expect(message).not.toMatch(/\[COPY:/);
    expect(message).not.toMatch(/authorization|bearer|aauth|guest_access_token|token=/i);
  }, 5000);

  it("reachable when a loopback /health responds", async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    const port: number = await new Promise((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", () => {
        const address = server!.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });

    const result = await probeLiveApi(`http://127.0.0.1:${port}`);
    expect(result).toEqual({ reachable: true });
  }, 5000);

  it("rejects bare localhost and non-loopback without issuing a network call", async () => {
    await expect(probeLiveApi("http://localhost:18080")).resolves.toEqual({
      reachable: false,
      reason: "invalid_url",
    });
    await expect(probeLiveApi("http://example.com:80")).resolves.toEqual({
      reachable: false,
      reason: "invalid_url",
    });
  });

  it("timeout reason gets a distinct message token from unreachable", () => {
    const timedOut = formatLiveApiUnavailableMessage("http://127.0.0.1:18080", "timeout");
    const unreachable = formatLiveApiUnavailableMessage("http://127.0.0.1:18080", "unreachable");
    expect(timedOut).toMatch(/live API probe timed out/i);
    expect(unreachable).toMatch(/Live API not listening/i);
    expect(timedOut).not.toEqual(unreachable);
    expect(timedOut).not.toMatch(/\[COPY:/);
    expect(unreachable).not.toMatch(/\[COPY:/);
  });
});
