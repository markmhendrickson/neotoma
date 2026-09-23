/**
 * Sandbox probe scoring contract (shared by deployed_probes.sh + vitest).
 *
 * Discriminator: response header `X-Neotoma-Sandbox` is sandbox only when
 * its value trims to exactly `"1"` — matching `sandboxHeaderMiddleware` in
 * `src/services/sandbox_mode.ts`. Presence alone is not enough (reject
 * `0` / `false` / empty / unknown). Do not reuse `isSandboxMode()` env
 * truthiness (`1|true|yes`); that is the process env contract, not the
 * response-header stamp.
 *
 * Status widening (when hostIsSandbox):
 *   - sandbox_allowed "hosted_ok" → union SANDBOX_HOSTED_OK_EXTRA_STATUSES
 *   - sandbox_allowed "none"      → union SANDBOX_DESTRUCTIVE_EXTRA_STATUSES
 *                                   (403 only — never 200)
 *   - non-sandbox host            → base unchanged
 */

import { fileURLToPath } from "node:url";

/** @type {readonly number[]} */
export const SANDBOX_HOSTED_OK_EXTRA_STATUSES = Object.freeze([
  200, 204, 400, 403, 404, 405, 429,
]);

/** @type {readonly number[]} */
export const SANDBOX_DESTRUCTIVE_EXTRA_STATUSES = Object.freeze([403]);

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isSandboxHeaderValue(raw) {
  return String(raw ?? "").trim() === "1";
}

/**
 * @param {{
 *   base: number[],
 *   sandboxAllowed: string,
 *   hostIsSandbox: boolean,
 * }} opts
 * @returns {number[]}
 */
export function widenExpectedStatuses({ base, sandboxAllowed, hostIsSandbox }) {
  const baseStatuses = Array.isArray(base) ? base.map(Number) : [];
  if (!hostIsSandbox) {
    return [...baseStatuses];
  }
  if (sandboxAllowed === "hosted_ok") {
    return uniqueSorted([...baseStatuses, ...SANDBOX_HOSTED_OK_EXTRA_STATUSES]);
  }
  if (sandboxAllowed === "none") {
    return uniqueSorted([
      ...baseStatuses,
      ...SANDBOX_DESTRUCTIVE_EXTRA_STATUSES,
    ]);
  }
  return [...baseStatuses];
}

/**
 * @param {number[]} statuses
 * @returns {number[]}
 */
function uniqueSorted(statuses) {
  return [...new Set(statuses)].sort((a, b) => a - b);
}

// CLI for bash consumers (deployed_probes.sh). Keep argv surface minimal.
const invokedAsCli =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedAsCli) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "is-sandbox-header") {
    process.exit(isSandboxHeaderValue(rest[0] ?? "") ? 0 : 1);
  }
  if (cmd === "widen") {
    const opts = JSON.parse(rest[0] ?? "{}");
    process.stdout.write(JSON.stringify(widenExpectedStatuses(opts)));
    process.exit(0);
  }
  console.error(
    `probe_sandbox_scoring.mjs: unknown command ${JSON.stringify(cmd)}. Use is-sandbox-header | widen.`,
  );
  process.exit(2);
}
