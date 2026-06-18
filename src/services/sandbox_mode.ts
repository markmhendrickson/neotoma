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

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type express from "express";

export function isSandboxMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.NEOTOMA_SANDBOX_MODE ?? "").toString().trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

// ---------------------------------------------------------------------------
// Boot-time mode resolution (plan ent_b4958d038bd41e8694fe0aef, Phase 1).
//
// Pure-function resolver. Phase 1 ships the resolver + tests only; src/actions.ts
// startup wiring lands in Phase 2. Refuse mode is gated by NEOTOMA_REFUSE_MODE
// (default "warn") so the first cut never lock-outs existing self-hosters.
// ---------------------------------------------------------------------------

export type NeotomaSandboxModeName =
  | "local"
  | "production"
  | "local_sandbox"
  | "hosted_sandbox"
  | "refuse";

export interface ResolveSandboxModeInputs {
  /** True when bearer-token auth is configured (public key registered). */
  authConfigured: boolean;
  /** True when the listen bind is loopback-only (127.0.0.1 / ::1). */
  loopbackBindOnly: boolean;
  /** True when NEOTOMA_ENV resolves to "production" / "prod". */
  productionEnv: boolean;
  /** True when NEOTOMA_SANDBOX_MODE=1 (hosted sandbox already shipping). */
  hostedSandboxEnabled: boolean;
  /** Refuse-mode policy: "warn" logs a banner and continues; "enforce" exits non-zero. */
  refusePolicy: "warn" | "enforce";
  /**
   * Optional NEOTOMA_FORCE_MODE override (dev only). When set to a valid mode
   * name and `productionEnv === false`, the resolver returns this mode
   * unconditionally with a reason noting the override. Honored only outside
   * production; production env hard-rejects the override at boot (see
   * src/actions.ts startup wiring).
   */
  forceMode?: NeotomaSandboxModeName | null;
}

export interface ResolveSandboxModeResult {
  mode: NeotomaSandboxModeName;
  /** Human-readable reason for the chosen mode; surfaced in boot banner. */
  reason: string;
  /** True when the resolver wants the process to exit non-zero. Only set in refuse+enforce. */
  shouldRefuseBoot: boolean;
}

/**
 * Resolve the sandbox mode at server boot.
 *
 * Precedence:
 *   0. `forceMode` (if set AND !productionEnv) -> forced mode (dev override).
 *   1. `authConfigured && productionEnv`       -> production (hosted multi-tenant).
 *   2. `authConfigured && !productionEnv`      -> local      (installed end-user app).
 *   3. `hostedSandboxEnabled`                  -> hosted_sandbox  (already shipping).
 *   4. `loopbackBindOnly && !productionEnv`    -> local_sandbox   (opt-out default).
 *   5. otherwise                               -> refuse           (v0.11.1 advisory class).
 *
 * Step 5 is the regression class the gates exist to catch: a non-loopback bind
 * with no auth configured and no explicit sandbox opt-in. The first cut treats
 * this as a *warning* (refusePolicy=warn) so upgrades do not break existing
 * untested self-host configs; a later release flips the default to "enforce".
 *
 * The `local` vs `production` split distinguishes the daily-driver installed
 * end-user app (single user, real data, runs on the user's own machine) from
 * a future hosted multi-tenant production deployment. UI gates downstream
 * branch on this distinction (e.g. the hosted_sandbox funnel must never render
 * for `local`, and certain admin affordances are local-only).
 */
export function resolveSandboxMode(inputs: ResolveSandboxModeInputs): ResolveSandboxModeResult {
  if (inputs.forceMode && !inputs.productionEnv) {
    return {
      mode: inputs.forceMode,
      reason: `forceMode override active (NEOTOMA_FORCE_MODE=${inputs.forceMode}); honored only outside production`,
      shouldRefuseBoot: false,
    };
  }

  if (inputs.authConfigured) {
    if (inputs.productionEnv) {
      return {
        mode: "production",
        reason: "bearer-token auth configured AND NEOTOMA_ENV=production (hosted multi-tenant)",
        shouldRefuseBoot: false,
      };
    }
    return {
      mode: "local",
      reason: "bearer-token auth configured (installed end-user app, non-production env)",
      shouldRefuseBoot: false,
    };
  }

  if (inputs.hostedSandboxEnabled) {
    return {
      mode: "hosted_sandbox",
      reason: "NEOTOMA_SANDBOX_MODE=1 (per-visitor ephemeral principals, 7d TTL)",
      shouldRefuseBoot: false,
    };
  }

  if (inputs.loopbackBindOnly && !inputs.productionEnv) {
    return {
      mode: "local_sandbox",
      reason:
        "loopback-only bind, no auth, non-production env (opt-out default; closes silent LOCAL_DEV_USER_ID fallback)",
      shouldRefuseBoot: false,
    };
  }

  // Refuse mode: no-auth + non-loopback (or production env). This is the
  // v0.11.1 advisory regression class.
  return {
    mode: "refuse",
    reason:
      "no auth configured AND bind is non-loopback (or NEOTOMA_ENV=production). " +
      "This shape matches the v0.11.1 inspector auth-bypass advisory. " +
      "See docs/security/advisories/2026-05-11-inspector-auth-bypass.md.",
    shouldRefuseBoot: inputs.refusePolicy === "enforce",
  };
}

/**
 * Build the boot banner lines for a resolved sandbox mode. Pure (no IO) so the
 * refuse-mode remediation text is unit-testable. The caller writes the joined
 * result to stderr.
 *
 * Remediation under `refuse` differs by environment: resolveSandboxMode() gates
 * the local_sandbox loopback escape on `!productionEnv` (step 4), so binding to
 * 127.0.0.1 under NEOTOMA_ENV=production does NOT escape refuse mode. The banner
 * therefore only advertises the loopback escape when it actually works. See
 * issue #1505.
 */
export function buildSandboxBootBannerLines(inputs: {
  mode: NeotomaSandboxModeName;
  reason: string;
  shouldRefuseBoot: boolean;
  refusePolicy: "warn" | "enforce";
  productionEnv: boolean;
}): string[] {
  const { mode, reason, shouldRefuseBoot, refusePolicy, productionEnv } = inputs;
  const lines: string[] = [];
  lines.push("");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push(`[neotoma] Sandbox mode resolved: ${mode}`);
  lines.push(`[neotoma] Reason: ${reason}`);
  if (mode === "refuse") {
    lines.push(
      `[neotoma] WARNING: this server topology matches the v0.11.1 inspector ` +
        `auth-bypass advisory class.`
    );
    if (productionEnv) {
      lines.push(
        `[neotoma] Under NEOTOMA_ENV=production, loopback bind does NOT escape ` +
          `refuse mode. Set NEOTOMA_REQUIRE_AUTH=1 + provision auth, OR opt into ` +
          `NEOTOMA_SANDBOX_MODE=1 for the hosted-sandbox profile.`
      );
    } else {
      lines.push(
        `[neotoma] Set NEOTOMA_REQUIRE_AUTH=1 + provision auth, OR bind to ` +
          `loopback (NEOTOMA_HTTP_HOST=127.0.0.1), OR opt into ` +
          `NEOTOMA_SANDBOX_MODE=1 for the hosted-sandbox profile.`
      );
    }
    if (shouldRefuseBoot) {
      lines.push(`[neotoma] NEOTOMA_REFUSE_MODE=enforce — refusing to start. ` + `Exit code 1.`);
    } else {
      lines.push(
        `[neotoma] NEOTOMA_REFUSE_MODE=${refusePolicy} — boot continues; set ` +
          `NEOTOMA_REFUSE_MODE=enforce to make this fatal.`
      );
    }
  }
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push("");
  return lines;
}

/**
 * Read NEOTOMA_REFUSE_MODE from env. Defaults to "warn" for the first cut so
 * upgrades do not regress existing self-host configs. Operators flip to
 * "enforce" once they have confirmed their topology.
 */
export function resolveRefusePolicy(env: NodeJS.ProcessEnv = process.env): "warn" | "enforce" {
  const raw = (env.NEOTOMA_REFUSE_MODE ?? "warn").toString().trim().toLowerCase();
  return raw === "enforce" ? "enforce" : "warn";
}

/**
 * Read NEOTOMA_FORCE_MODE from env. Returns a valid mode name or null.
 *
 * Used to let developers iterating on a non-default mode UX (e.g. the hosted
 * sandbox funnel) flip a local server into that mode without changing bind
 * topology or auth config. The override is honored ONLY when NEOTOMA_ENV is
 * not production; production envs ignore it. The boot path in `src/actions.ts`
 * additionally hard-errors when FORCE_MODE is set in a production env, so a
 * misconfigured production deploy cannot silently downgrade itself.
 *
 * Returns null when the env var is unset, empty, or an unrecognized value.
 * Unrecognized values are intentionally silent (returned as null) so a typo
 * cannot accidentally activate the override; the boot banner shows the
 * resolved mode regardless.
 */
export function resolveForceMode(
  env: NodeJS.ProcessEnv = process.env
): NeotomaSandboxModeName | null {
  const raw = (env.NEOTOMA_FORCE_MODE ?? "").toString().trim().toLowerCase();
  if (!raw) return null;
  const valid: ReadonlySet<NeotomaSandboxModeName> = new Set([
    "local",
    "production",
    "local_sandbox",
    "hosted_sandbox",
    "refuse",
  ]);
  return valid.has(raw as NeotomaSandboxModeName) ? (raw as NeotomaSandboxModeName) : null;
}

// ---------------------------------------------------------------------------
// Install fingerprint (deterministic per install, stable across restarts).
//
// Used to derive the `sandbox:<install-fingerprint>` principal that will
// replace the silent LOCAL_DEV_USER_ID fallback in local_sandbox mode. The
// fingerprint is stored at <dataDir>/.install_fingerprint on first call; all
// subsequent calls read it back, so the principal is stable across restarts.
//
// This is NOT a secret. It only needs to be:
//   - deterministic per install (same machine -> same fingerprint)
//   - distinct across installs (so two co-located installs do not collide)
//   - cheap to derive (no network, no external service)
// ---------------------------------------------------------------------------

const INSTALL_FINGERPRINT_FILENAME = ".install_fingerprint";

/**
 * Read or create the install fingerprint at `<dataDir>/.install_fingerprint`.
 * Returns a 16-char hex slice of the stored 32-byte random ID.
 *
 * Pure-ish: file IO is the only side effect. First call writes the file;
 * subsequent calls return the same value. Crash-safe: on read error or empty
 * file, regenerates rather than throwing.
 */
export function getOrCreateInstallFingerprint(dataDir: string): string {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const path = join(dataDir, INSTALL_FINGERPRINT_FILENAME);
  if (existsSync(path)) {
    try {
      const stored = readFileSync(path, "utf8").trim();
      if (stored.length >= 16 && /^[0-9a-f]+$/.test(stored)) {
        return stored.slice(0, 16);
      }
    } catch {
      // Fall through and regenerate.
    }
  }
  const fresh = randomBytes(32).toString("hex");
  writeFileSync(path, fresh, { mode: 0o600 });
  return fresh.slice(0, 16);
}

/**
 * Derive the local_sandbox principal id from an install fingerprint.
 * Returns a UUID-shaped string suitable for the `local_auth_users.id` column.
 *
 * Stable across restarts: same fingerprint -> same principal id.
 */
export function sandboxPrincipalIdFromFingerprint(fingerprint: string): string {
  const hash = createHash("sha256").update(`sandbox-install:${fingerprint}`).digest("hex");
  // Render as UUID-shape (8-4-4-4-12). Not a true UUIDv4 (no version bits);
  // matches the convention used by hashStringToUserId in local_auth.ts.
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
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
  next: express.NextFunction
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
  next: express.NextFunction
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
