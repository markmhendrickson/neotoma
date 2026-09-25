/**
 * Canonical production-environment detector, shared by every module that
 * needs to know whether this process is running in production.
 *
 * `NEOTOMA_ENV` is Neotoma's own dev/prod switch (see `src/config.ts`),
 * chosen instead of the ambient `NODE_ENV` so that a host process's
 * `NODE_ENV` cannot silently override Neotoma's own choice when Neotoma runs
 * embedded (e.g. as an MCP server loaded inside another Node workspace).
 * That isolation is preserved here: an explicit `NEOTOMA_ENV` always wins.
 *
 * But a deploy that sets only `NODE_ENV=production` — the shape a bare
 * Dockerfile produces (`ENV NODE_ENV=production` with no `NEOTOMA_ENV`) — was
 * previously read as development by every production-gated check, including
 * the `/mcp` local-caller gate (`isLocalRequest`, `developmentConnectionIdAllowed`
 * in `src/actions.ts`) and the root-landing mode resolver
 * (`src/services/root_landing/index.ts`). Both now import this module rather
 * than keeping their own copy, so a production determination is made exactly
 * once and the same way everywhere: `NODE_ENV=production` counts as
 * production only when `NEOTOMA_ENV` is not itself set to something else.
 *
 * Dev/test setups that already set `NODE_ENV=production` for unrelated
 * reasons — a built bundle run locally, a test asserting `NODE_ENV=production`
 * behaviour in an unrelated subsystem (docs visibility, entity-type guard,
 * schema registry) — are unaffected: they either also set `NEOTOMA_ENV`
 * explicitly, or don't call a check that consults this helper. See
 * `docs/operations/configuration.md` "Environments" for the operator-facing
 * migration note.
 */
export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const neotomaEnv = (env.NEOTOMA_ENV ?? "").trim().toLowerCase();
  if (neotomaEnv.length > 0) {
    return neotomaEnv === "production" || neotomaEnv === "prod";
  }
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  return nodeEnv === "production";
}
