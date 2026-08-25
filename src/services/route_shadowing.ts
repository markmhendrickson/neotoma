/**
 * Boot-time guard against route shadowing (issue #2208).
 *
 * Express matches routes first-wins. A static path registered *after* a param
 * route that also matches it is unreachable dead code — the param route
 * captures the request first. This is invisible by inspection: both routes are
 * registered, both appear in the route table, and only the order is wrong.
 *
 * That is exactly how `GET /entities/duplicates` shipped broken in v0.21.5. It
 * was registered ~4,500 lines after `GET /entities/:id`, so every HTTP caller
 * (the CLI `entities find-duplicates` included) got a `404 Entity not found`
 * from a database lookup on the literal string "duplicates". The MCP tool
 * `list_potential_duplicates` kept working because it dispatches in-process and
 * never touches the router, which is why the bug stayed hidden.
 *
 * This module walks the registered route table and fails the process on any
 * static route shadowed by an earlier param route. It is deliberately generic:
 * an audit at the time of the fix found exactly one shadowed route among 142
 * registrations, so the value here is catching the *next* one, on any resource.
 */

/** One registered route, in registration order. */
export interface RegisteredRoute {
  method: string;
  path: string;
}

/** A static route rendered unreachable by an earlier param route. */
export interface ShadowedRoute {
  method: string;
  /** The unreachable static route. */
  path: string;
  /** The earlier param route that captures it first. */
  shadowedBy: string;
}

function segmentsOf(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function isParamSegment(segment: string): boolean {
  return segment.startsWith(":") || segment === "*";
}

function hasParamSegment(path: string): boolean {
  return segmentsOf(path).some(isParamSegment);
}

/**
 * True when `paramPath` (an earlier registration) would match every request
 * that `staticPath` is meant to serve, making `staticPath` unreachable.
 */
function shadows(paramPath: string, staticPath: string): boolean {
  const a = segmentsOf(paramPath);
  const b = segmentsOf(staticPath);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => isParamSegment(seg) || seg === b[i]);
}

/**
 * Find every static route that an earlier-registered param route shadows.
 * `routes` MUST be in registration order — that order is the whole subject.
 */
export function findShadowedRoutes(routes: RegisteredRoute[]): ShadowedRoute[] {
  const shadowed: ShadowedRoute[] = [];
  routes.forEach((route, index) => {
    if (hasParamSegment(route.path)) return;
    for (const earlier of routes.slice(0, index)) {
      if (earlier.method !== route.method) continue;
      if (!hasParamSegment(earlier.path)) continue;
      if (shadows(earlier.path, route.path)) {
        shadowed.push({
          method: route.method,
          path: route.path,
          shadowedBy: earlier.path,
        });
        return;
      }
    }
  });
  return shadowed;
}

/**
 * Message text is a dev-facing UX surface: it must name both halves of the
 * shadowing pair and the remedy, because the failure is otherwise invisible.
 */
export function formatShadowedRouteError(shadowed: ShadowedRoute[]): string {
  const lines = shadowed.map(
    (s) =>
      `Route shadowing detected: '${s.method} ${s.path}' is unreachable — ` +
      `registered after '${s.shadowedBy}' which matches first. ` +
      `Move it earlier or add an exclusion in the '${s.shadowedBy}' handler.`
  );
  return lines.join("\n");
}

/**
 * Read the route table off an Express app in registration order.
 *
 * Reaches into Express internals (`app._router.stack`), which are untyped and
 * differ across major versions. Returns an empty list rather than throwing when
 * the shape is unrecognized — see `assertNoShadowedRoutes` for why that is the
 * safe direction here.
 */
export function extractRoutes(app: unknown): RegisteredRoute[] {
  const router =
    (app as { _router?: { stack?: unknown[] } })?._router ??
    (app as { router?: { stack?: unknown[] } })?.router;
  const stack = router?.stack;
  if (!Array.isArray(stack)) return [];

  const routes: RegisteredRoute[] = [];
  for (const layer of stack) {
    const route = (layer as { route?: { path?: unknown; methods?: Record<string, boolean> } })
      ?.route;
    if (!route || typeof route.path !== "string") continue;
    for (const [method, enabled] of Object.entries(route.methods ?? {})) {
      if (enabled) routes.push({ method: method.toUpperCase(), path: route.path });
    }
  }
  return routes;
}

/**
 * Fail the boot on any shadowed route.
 *
 * Throws rather than warns: an unreachable route is not a runnable state, and a
 * warning is precisely what let this class of bug ship silently. Callers wire
 * this in before `listen()` so the process never accepts traffic against a
 * route table that cannot serve it.
 *
 * If the route table cannot be read (unrecognized Express internals), this is a
 * no-op. Refusing to boot because a *guard* could not introspect the router
 * would turn a defensive check into an outage, and the guard's own failure mode
 * must not be worse than the bug it prevents.
 */
export function assertNoShadowedRoutes(app: unknown): void {
  const routes = extractRoutes(app);
  if (routes.length === 0) return;
  const shadowed = findShadowedRoutes(routes);
  if (shadowed.length === 0) return;
  throw new Error(formatShadowedRouteError(shadowed));
}
