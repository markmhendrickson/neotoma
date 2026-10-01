/**
 * Default sandbox-mode pin for test/eval/playwright harnesses.
 *
 * After the HTTP listener binds loopback by default, the sandbox-mode
 * resolver correctly lands on `local_sandbox` and substitutes a per-install
 * principal for unauthenticated local requests. Harnesses that still seed
 * and assert against the shared nil-UUID `LOCAL_DEV_USER_ID` need the boot
 * mode forced back to `refuse` (the pre-fix effective mode when the
 * listener bound all interfaces) so identity stays consistent across
 * Bearer-authenticated agent calls and unauthenticated bookkeeping reads.
 *
 * Callers that already set `NEOTOMA_FORCE_MODE` keep their explicit value.
 */
export function resolveHarnessForceMode(env: NodeJS.ProcessEnv = process.env): string {
  return env.NEOTOMA_FORCE_MODE ?? "refuse";
}
