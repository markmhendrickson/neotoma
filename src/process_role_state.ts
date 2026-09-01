/**
 * Process-role state, split from `process_role.ts` so that module can stay a
 * pure side-effect import (`import "./process_role.js"`) while `config.ts`
 * reads the flag without triggering that side effect.
 *
 * Why a module-scoped flag rather than an env var: env vars are inherited by
 * child processes and leak in from the shell and .env files, so an ambient
 * `NEOTOMA_PROCESS_ROLE=server` would silently flip the DB backend for every
 * CLI invocation and every test worker. That is not hypothetical — the value
 * was already present in this repo's environment and changed the default under
 * vitest during development of neotoma#2280. A module flag is process-local and
 * set only by an entrypoint that actually imports `process_role.js`.
 */

let serverProcess = false;

/** Called by long-lived server entrypoints. */
export function markServerProcess(): void {
  serverProcess = true;
}

/** True once a server entrypoint has declared itself. */
export function isServerProcess(): boolean {
  return serverProcess;
}

/** Test-only: restore the default (CLI) role. */
export function resetProcessRoleForTests(): void {
  serverProcess = false;
}
