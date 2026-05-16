/**
 * Verify HTTP server keep-alive timeout is configured to outlast typical
 * reverse-proxy idle timeouts (60–300 s).
 *
 * The production code in `tryListen` (src/actions.ts) sets:
 *   server.keepAliveTimeout = NEOTOMA_KEEPALIVE_TIMEOUT_MS (default 120000)
 *   server.headersTimeout    = NEOTOMA_HEADERS_TIMEOUT_MS  (default 125000)
 *
 * The release supplement claims these extensions "prevent MCP session drops
 * behind reverse proxies." Without a regression test, a future change that
 * accidentally drops Node's default 5-second keep-alive timeout back in would
 * not be caught until users started reporting random "bearer token expired"
 * style 502s mid-stream from Cloudflare Tunnel / ngrok.
 *
 * Strategy: query the server started by `vitest.global_setup.ts` using a
 * raw HTTP client (so we can read the `Keep-Alive: timeout=N` response
 * header that Node emits based on the configured `keepAliveTimeout`). Then
 * assert the value comfortably exceeds Node's 5-second default.
 */
import { describe, it, expect } from "vitest";
import http from "node:http";

const KEEPALIVE_HEADER_RE = /timeout\s*=\s*(\d+)/i;

function fetchHeaders(port: number, path: string): Promise<Record<string, string | string[] | undefined>> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: { Connection: "keep-alive" },
      },
      (res) => {
        // Drain the body to release the socket.
        res.on("data", () => {});
        res.on("end", () => resolve(res.headers));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("HTTP server keep-alive timeout", () => {
  it("Keep-Alive response header timeout greatly exceeds Node's 5s default", async () => {
    const port = parseInt(process.env.NEOTOMA_HTTP_PORT ?? "18080", 10);
    const headers = await fetchHeaders(port, "/health");

    // Node emits `Keep-Alive: timeout=N` (seconds) derived from
    // server.keepAliveTimeout (milliseconds). The header is only present
    // when the connection actually stays keep-alive, which depends on the
    // response being below the threshold for "should close" — for a small
    // /health response this is true.
    const ka = headers["keep-alive"];
    expect(ka).toBeDefined();
    const match = (Array.isArray(ka) ? ka.join(",") : (ka as string)).match(
      KEEPALIVE_HEADER_RE,
    );
    expect(match).not.toBeNull();
    const timeoutSec = parseInt(match![1], 10);

    // Default config: keepAliveTimeout = 120000 ms = 120 s.
    // Floor at 60 s so the test still passes if a future env var override
    // lowers it modestly, but catches a regression back to Node's 5 s default.
    expect(timeoutSec).toBeGreaterThanOrEqual(60);
  });
});
