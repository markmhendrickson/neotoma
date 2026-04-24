/**
 * Sandbox-mode helpers for the public `sandbox.neotoma.io` Fly deployment.
 *
 * The sandbox runs with `NEOTOMA_SANDBOX_MODE=1` so unauthenticated callers
 * can write to a shared demo user (`SANDBOX_PUBLIC_USER_ID`) without a bearer
 * token. This file centralises:
 *
 *   - Mode detection (`isSandboxMode`).
 *   - Destructive-op gating (`isDestructiveSandboxRoute`).
 *   - The `X-Neotoma-Sandbox` response-header stamp + mode banner logging.
 *
 * Sandbox data is reset weekly (Sunday 00:00 UTC) by `scripts/reset_sandbox.ts`;
 * see docs/subsystems/sandbox_deployment.md.
 */

import type express from "express";

export function isSandboxMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.NEOTOMA_SANDBOX_MODE ?? "").toString().trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Routes that permanently or aggressively remove data. These are blocked on
 * the public sandbox host so abusive callers cannot nuke the demo dataset
 * between scheduled resets.
 *
 * Soft deletes (`/delete_entity`, `/delete_relationship`) are allowed because
 * they are reversible via `/restore_entity` and `/restore_relationship` and
 * the weekly reset will replace the dataset anyway.
 */
const DESTRUCTIVE_ROUTES: ReadonlySet<string> = new Set([
  // Admin endpoints that could wipe or mutate the whole corpus.
  "/entities/merge",
  "/entities/split",
  "/recompute_snapshots_by_type",
  "/health_check_snapshots",
  "/update_schema_incremental",
  // Future-proofing: if `neotoma wipe` ever gets an HTTP surface, add it here.
]);

export function isDestructiveSandboxRoute(path: string): boolean {
  return DESTRUCTIVE_ROUTES.has(path);
}

/**
 * Mark every response with `X-Neotoma-Sandbox: 1` so clients (especially the
 * Inspector) can detect sandbox mode without an extra API call.
 */
export function sandboxHeaderMiddleware(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  res.setHeader("X-Neotoma-Sandbox", "1");
  next();
}

/**
 * Guard for destructive admin endpoints. Returns a 403 error envelope when
 * sandbox mode is on and the incoming path matches. Otherwise passes through.
 */
export function sandboxDestructiveGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!isSandboxMode()) {
    return next();
  }
  if (!isDestructiveSandboxRoute(req.path)) {
    return next();
  }
  res.status(403).json({
    error_code: "SANDBOX_DISABLED",
    message: `Route ${req.path} is disabled on the public sandbox. Install Neotoma locally to run destructive operations.`,
    details: {
      docs: "https://github.com/markmhendrickson/neotoma#installation",
      weekly_reset: "Sunday 00:00 UTC",
    },
    timestamp: new Date().toISOString(),
  });
}
