/**
 * Shared fail-fast probe for CLI tests that hit a live loopback HTTP API.
 *
 * Unit / `no DB` lane contract: do not hang to Vitest's global `testTimeout`
 * (60000ms in vitest.config.ts) when the server is absent. Prefer moving
 * live-HTTP cases into the integration lane; if a case must stay runnable
 * outside that lane, call `probeLiveApi` first and skip/fail with
 * `formatLiveApiUnavailableMessage`.
 *
 * Search term for siblings: `resolveTestApiBaseUrl` under `tests/cli/`.
 */

export const LIVE_API_PROBE_DEFAULT_TIMEOUT_MS = 800;

export type LiveApiProbeReason = "unreachable" | "timeout" | "invalid_url";

export type LiveApiProbeResult =
  | { reachable: true }
  | { reachable: false; reason: LiveApiProbeReason };

/**
 * Resolves the base URL for CLI tests that exercise a live HTTP server,
 * honoring the same env vars the CLI reads for its session/dev port.
 */
export function resolveTestApiBaseUrl(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT || process.env.NEOTOMA_HTTP_PORT || "18080";
  return `http://127.0.0.1:${port}`;
}

function isLiteralLoopbackHostname(hostname: string): boolean {
  // Arch constraint: reject bare `localhost` string match — require literal loopback IP.
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/**
 * Minimal reachability check against a loopback API. Never attaches credentials.
 * Uses `redirect: "error"` so a probe cannot follow an off-loopback Location.
 */
export async function probeLiveApi(
  baseUrl: string,
  opts?: { timeoutMs?: number }
): Promise<LiveApiProbeResult> {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { reachable: false, reason: "invalid_url" };
  }

  if (!isLiteralLoopbackHostname(parsed.hostname)) {
    return { reachable: false, reason: "invalid_url" };
  }

  const timeoutMs = opts?.timeoutMs ?? LIVE_API_PROBE_DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Prefer the lightweight /health path used elsewhere in the suite; fall back to root.
  const probeUrl = new URL("/health", parsed).toString();

  try {
    await fetch(probeUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
      // Reachability only — never attach Authorization / Bearer / AAuth material.
      headers: { Accept: "application/json" },
    });
    return { reachable: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err);
    if (name === "AbortError" || /aborted|timeout/i.test(message)) {
      return { reachable: false, reason: "timeout" };
    }
    // redirect: "error" surfaces as a TypeError / fetch failed when Location leaves
    // the origin, or as an opaque redirect error — treat as unreachable for messaging.
    return { reachable: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * UX-shaped skip/fail text: resolved port + env var *names* + next action.
 * Never interpolates env values, headers, or token-shaped material.
 */
export function formatLiveApiUnavailableMessage(
  baseUrl: string,
  reason: LiveApiProbeReason
): string {
  let hostPort = baseUrl;
  try {
    const parsed = new URL(baseUrl);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    hostPort = `${parsed.hostname}:${port}`;
  } catch {
    /* keep raw baseUrl */
  }

  const envNames = "NEOTOMA_SESSION_DEV_PORT / NEOTOMA_HTTP_PORT";
  const nextAction = "Start the local server, or run this test in the integration lane.";

  if (reason === "timeout") {
    return `Live API probe timed out on ${hostPort} (${envNames}). ${nextAction}`;
  }
  if (reason === "invalid_url") {
    return `Live API not listening on ${hostPort} (${envNames}) — base URL must be literal loopback (127.0.0.1 or ::1). ${nextAction}`;
  }
  return `Live API not listening on ${hostPort} (${envNames}). ${nextAction}`;
}
