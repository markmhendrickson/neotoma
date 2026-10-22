/**
 * Bind-host resolution for the dev proxy (scripts/dev-proxy.js).
 *
 * Mirrors the shape of `resolveHttpBindHost()` / `isLoopbackHost()` in
 * src/actions.ts (the main HTTP server's resolver): loopback is the
 * default, and any explicit non-empty value is honored as a deliberate
 * opt-in. Node's own default when no `host` is passed to `.listen()` is
 * ALL interfaces (0.0.0.0/::), which is the opposite of safe here — this
 * proxy forwards to the branch API, so an all-interfaces bind is a live
 * LAN path to the application regardless of how the downstream Actions
 * listener binds.
 *
 * `scripts/dev-proxy.js` cannot import `resolveHttpBindHost` from
 * src/actions.ts directly (that module pulls in the full compiled server
 * dependency graph into what is otherwise a dependency-free standalone
 * script), so the resolver is mirrored here in its own small module rather
 * than inlined — keep the two in sync if either changes.
 *
 * Anyone who genuinely needs LAN/remote access (e.g. testing from a phone
 * on the same network) can opt in explicitly with PROXY_HOST=0.0.0.0 (or
 * another non-loopback address). The documented remote-access path for the
 * main server is the ngrok tunnel (`npm run dev:server:tunnel`), which
 * reaches the server via its own loopback bind and does not route through
 * this proxy at all.
 */

/**
 * Resolve the host the dev proxy's HTTP/HTTPS listeners should bind to.
 * Defaults to loopback; an explicit, non-empty PROXY_HOST is honored
 * verbatim as a deliberate opt-in (e.g. "0.0.0.0" for all interfaces).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveProxyBindHost(env = process.env) {
  const raw = (env.PROXY_HOST || '').trim();
  return raw.length > 0 ? raw : '127.0.0.1';
}

/** True when the given bind host resolves to a loopback-only address. */
export function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}
