/**
 * Canonical production-environment detector, shared by every module that
 * needs to know whether this process is running in production.
 *
 * `NEOTOMA_ENV` is Neotoma's own dev/prod switch (see `src/config.ts`).
 * `NODE_ENV` is the ambient Node convention. Both are consulted, and the
 * precedence follows the repo's fail-closed rule (`CLAUDE.md` "Fail closed on
 * the field that carries the safety meaning"): when the two disagree, or
 * either is absent, unrecognized, or malformed, the default is the
 * *restrictive* branch, i.e. production.
 *
 * `isProductionEnvironment()` therefore returns `true` whenever EITHER
 * variable says production:
 *   - `NEOTOMA_ENV` resolves to `production`/`prod`, OR
 *   - `NODE_ENV === "production"`.
 *
 * `NEOTOMA_ENV` is checked against a recognized set of non-production
 * values — `development`, `dev`, `test` — in addition to its two production
 * spellings. A `NEOTOMA_ENV` set to anything outside that recognized set
 * (a typo, an unimplemented profile like `staging`, stray whitespace-only
 * content) is treated as production rather than silently falling through to
 * `NODE_ENV`: an unrecognized value is not evidence of an operator's
 * deliberate "not production" choice, so it cannot be allowed to suppress
 * the `NODE_ENV` signal. One rate-limited warning line is written to stderr
 * per unrecognized value naming both the value seen and the recognized set,
 * so a typo is diagnosable rather than a silent downgrade.
 *
 * This module used to be three independent copies (the `/mcp` and REST
 * local-caller gate in `src/actions.ts`, the root-landing mode resolver in
 * `src/services/root_landing/index.ts`, and the webhook URL scheme
 * enforcement in `src/services/subscriptions/webhook_delivery.ts`), each
 * maintained separately and each with different precedence. All three now
 * import this single function, so a production determination is made
 * exactly once and the same way everywhere — including for
 * `isWebhookUrlAllowed`, whose outbound-delivery safety direction differs
 * from the other two callers' inbound-caller-trust direction: an
 * unconditional OR is the restrictive choice for both directions, which is
 * why one rule now serves all three rather than a caller-specific carve-out.
 *
 * `src/config.ts`'s data-directory/DB-file/port resolution deliberately
 * stays `NEOTOMA_ENV`-only and does NOT use this function — that is a
 * data-locality boundary, not a trust boundary, and widening it risks a
 * local dev process silently pointing at the production database.
 *
 * Escape hatch for running a production-built bundle locally: this now
 * counts as production (previously it did not unless `NEOTOMA_ENV` was also
 * set). Setting `NEOTOMA_ENV=development` no longer opts back out, because
 * that would reintroduce the exact loosening this module exists to close
 * (see `docs/operations/configuration.md` "Environments"). Use
 * `NEOTOMA_TRUST_PROD_LOOPBACK=1` for a genuinely local, single-host
 * deployment, or set `NODE_ENV` to something other than `production` (e.g.
 * unset it, or `development`) if that's within your control.
 *
 * See `docs/operations/configuration.md` "Environments" for the full
 * operator-facing migration note.
 */

/** `NEOTOMA_ENV` values that resolve to production. */
const NEOTOMA_ENV_PRODUCTION_VALUES: ReadonlySet<string> = new Set(["production", "prod"]);

/** `NEOTOMA_ENV` values that resolve to non-production. */
const NEOTOMA_ENV_NON_PRODUCTION_VALUES: ReadonlySet<string> = new Set([
  "development",
  "dev",
  "test",
]);

const UNRECOGNIZED_NEOTOMA_ENV_LOG_INTERVAL_MS = 60_000;
let lastUnrecognizedNeotomaEnvLogAt = 0;
let lastUnrecognizedNeotomaEnvValue: string | undefined;

/**
 * Warn once per interval (and only when the offending value itself changes,
 * so a fixed-but-still-wrong value doesn't spam stderr forever) that
 * `NEOTOMA_ENV` was set to a value outside the recognized set and is
 * therefore being treated as production. Never called for an empty/unset
 * `NEOTOMA_ENV` — that path falls through to `NODE_ENV` silently, since
 * "unset" is an ordinary, expected configuration, not a mistake to flag.
 */
function warnUnrecognizedNeotomaEnvOncePerInterval(rawValue: string): void {
  const now = Date.now();
  if (
    rawValue === lastUnrecognizedNeotomaEnvValue &&
    now - lastUnrecognizedNeotomaEnvLogAt < UNRECOGNIZED_NEOTOMA_ENV_LOG_INTERVAL_MS
  ) {
    return;
  }
  lastUnrecognizedNeotomaEnvLogAt = now;
  lastUnrecognizedNeotomaEnvValue = rawValue;
  const recognized = [...NEOTOMA_ENV_PRODUCTION_VALUES, ...NEOTOMA_ENV_NON_PRODUCTION_VALUES].join(
    ", "
  );
  process.stderr.write(
    `[neotoma] isProductionEnvironment: NEOTOMA_ENV=${JSON.stringify(rawValue)} is not one of the ` +
      `recognized values (${recognized}) — treating this process as production. ` +
      `Set NEOTOMA_ENV to one of the recognized values, or unset it to fall back to NODE_ENV.\n`
  );
}

export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  const nodeEnvIsProduction = nodeEnv === "production";

  const neotomaEnv = (env.NEOTOMA_ENV ?? "").trim().toLowerCase();
  if (neotomaEnv.length > 0) {
    if (NEOTOMA_ENV_PRODUCTION_VALUES.has(neotomaEnv)) return true;
    if (NEOTOMA_ENV_NON_PRODUCTION_VALUES.has(neotomaEnv)) return nodeEnvIsProduction;
    // Unrecognized, non-empty NEOTOMA_ENV: fail closed rather than falling
    // through to NODE_ENV silently.
    warnUnrecognizedNeotomaEnvOncePerInterval(env.NEOTOMA_ENV ?? "");
    return true;
  }

  return nodeEnvIsProduction;
}
