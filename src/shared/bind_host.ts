/**
 * Single source of truth for listener bind-host resolution.
 *
 * Node binds to ALL interfaces (0.0.0.0/::) when a listener is given no
 * host, which is the opposite of safe for a self-hosted instance. Listeners
 * therefore resolve their host through this module: loopback by default, and
 * any explicit non-empty value from the environment is a deliberate opt-in
 * (e.g. `0.0.0.0` behind a tunnel or inside a container). Not every listener
 * is migrated yet: the dev-proxy resolver in `scripts/lib/proxy_bind_host.js`
 * still carries its own default (tracked in neotoma#2476).
 *
 * Callers: `resolveHttpBindHost()` in `src/actions.ts` (`NEOTOMA_HTTP_HOST`)
 * and the standalone MCP WebSocket bridge `src/mcp_ws_bridge.ts`
 * (`NEOTOMA_WS_HOST`). This module is dependency-free so the bridge can
 * import it without loading the Express server graph.
 */

/** Loopback-only default for every listener. */
export const DEFAULT_BIND_HOST = "127.0.0.1";

/**
 * Resolve a bind host from one environment variable. Empty, whitespace-only
 * or unset yields loopback; any other value is returned trimmed and verbatim
 * (an unusable value then makes the listen call fail rather than widening
 * the bind).
 */
export function resolveBindHostFromEnv(
  envVar: string,
  vars: NodeJS.ProcessEnv = process.env
): string {
  const raw = (vars[envVar] || "").trim();
  return raw.length > 0 ? raw : DEFAULT_BIND_HOST;
}

/** True when the given bind host resolves to a loopback-only address. */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}
