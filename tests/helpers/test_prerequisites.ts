/**
 * Hard prerequisites for the local `npm test` lane, and the named-skip contract
 * that keeps a fresh clone honest.
 *
 * Why this exists (issue #2090)
 * -----------------------------
 * `npm test` — which is what the pre-commit hook runs — covers more than CI's
 * baseline lane does: it additionally picks up `tests/integration`,
 * `tests/fixtures`, `src/**` and `inspector/src/**`. Several of those tests
 * shell out to, or serve, build artifacts that a plain `npm ci` does not
 * produce: the Inspector SPA shell, the Inspector's own `node_modules`, and the
 * compiled cursor-hooks package. On a fresh clone those tests FAILED, which is
 * indistinguishable from "my change broke something" and is what pushed
 * contributors onto `--no-verify`.
 *
 * The contract, per #2090's acceptance criteria: a missing hard prerequisite
 * must produce a SKIP whose reason NAMES the prerequisite and the command that
 * satisfies it — never a failure, and never a silent skip. Vitest does not
 * surface a per-suite skip reason in its default reporter output, so
 * `announceSkip()` also writes the reason to stderr. That is deliberate: the
 * acceptance criterion is that the reason is visible in the run output, not
 * merely encoded in a config file someone would have to go read.
 *
 * This is NOT a mechanism for muting inconvenient tests. Every entry below is a
 * build artifact with a one-line remediation; nothing here is gated on a live
 * network, a credential, or anything a contributor cannot produce locally.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * A hard prerequisite: an artifact the suite cannot synthesize, plus the exact
 * command that produces it.
 */
export interface Prerequisite {
  /** Greppable token naming the prerequisite. Appears verbatim in skip output. */
  readonly name: string;
  /** One-line remediation — a command a contributor can copy and run. */
  readonly remediation: string;
  /** Repo-relative path whose existence means the prerequisite is satisfied. */
  readonly probePath: string;
}

export const BUILT_INSPECTOR_ASSETS: Prerequisite = {
  name: "built inspector assets",
  remediation: "npm run build:inspector (or npm run test:setup)",
  probePath: path.join("dist", "inspector", "index.html"),
};

export const INSTALLED_INSPECTOR_DEPS: Prerequisite = {
  name: "installed inspector dependencies",
  remediation: "npm ci --prefix inspector (or npm run test:setup)",
  probePath: path.join("inspector", "node_modules"),
};

export const BUILT_CURSOR_HOOK_PACKAGE: Prerequisite = {
  name: "built cursor hook package",
  remediation: "npm run build --prefix packages/cursor-hooks (or npm run test:setup)",
  probePath: path.join("packages", "cursor-hooks", "dist", "stop.js"),
};

/** True when the prerequisite's artifact is present in this checkout. */
export function hasPrerequisite(prereq: Prerequisite, root: string = REPO_ROOT): boolean {
  return fs.existsSync(path.join(root, prereq.probePath));
}

/**
 * The canonical skip reason. Byte-stable so triage can grep for it and so the
 * docs and the code cannot drift apart.
 */
export function skipReason(prereq: Prerequisite): string {
  return `missing prerequisite: ${prereq.name} — ${prereq.remediation}`;
}

const announced = new Set<string>();

/**
 * Print the skip reason to stderr, once per prerequisite per process.
 *
 * Vitest's default reporter prints a skipped suite without its reason, so a
 * `describe.skipIf` alone would satisfy the letter of "skip, don't fail" while
 * violating the part that matters: the contributor has to be able to SEE why,
 * in the output they are already looking at.
 */
export function announceSkip(prereq: Prerequisite, subject: string): void {
  const key = `${prereq.name}::${subject}`;
  if (announced.has(key)) return;
  announced.add(key);
  process.stderr.write(`[neotoma] SKIP ${subject} — ${skipReason(prereq)}\n`);
}

/**
 * `describe.skipIf(...)` companion: returns true when the suite must be skipped,
 * and announces the reason on the way past.
 */
export function skipWithoutPrerequisite(prereq: Prerequisite, subject: string): boolean {
  if (hasPrerequisite(prereq)) return false;
  announceSkip(prereq, subject);
  return true;
}
