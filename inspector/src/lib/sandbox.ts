/**
 * Helpers for detecting and operating in Inspector's sandbox UI mode.
 *
 * The Inspector is always bundled into the Neotoma server build and served
 * at `/inspector` (same origin). On the hosted sandbox, ephemeral sessions
 * are created via the landing page pack picker and handed off to the
 * Inspector via a one-time code in the hash fragment. The API URL is always
 * relative (same origin).
 *
 * This module centralises the feature-flag reads + banner-state helpers so
 * individual components don't scatter `import.meta.env` probes.
 */

import { readStoredSandboxSession } from "./sandbox_session";

/**
 * True when the current bundle should render as the public sandbox UI. Either
 * the explicit build flag (`VITE_NEOTOMA_SANDBOX_UI`) or a live sandbox
 * session from the handoff flow flips this on. That way a self-hosted
 * Inspector that redeems a sandbox session still picks up the same "public /
 * transient / hide destructive actions" UX without a rebuild.
 */
export function isSandboxUiEnabled(): boolean {
  const raw = import.meta.env.VITE_NEOTOMA_SANDBOX_UI as string | undefined;
  if (raw) {
    const normalized = raw.toString().trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  }
  // Session-driven: an active redeemed sandbox session flips on the same UX.
  try {
    return readStoredSandboxSession() !== null;
  } catch {
    return false;
  }
}

/**
 * Now returns false unconditionally: the API URL is driven by the
 * session-handoff redeem + Settings override, not by a build-time lock. Kept
 * as an exported function for callers that still gate on it so we can wire
 * new policy later without a ripple-out rename.
 */
export function isApiUrlOverrideDisabled(): boolean {
  return false;
}

/**
 * Destructive admin actions (entity merge/split, schema removal, permanent
 * deletion) are hidden on the public sandbox — they would be blocked by the
 * server anyway via `sandboxDestructiveGuard`, but silencing the buttons
 * keeps the demo UX clean.
 */
export function areDestructiveActionsHidden(): boolean {
  return isSandboxUiEnabled();
}

export const SANDBOX_WEEKLY_RESET_LABEL = "Sunday 00:00 UTC";
export const SANDBOX_HOST_LABEL = "sandbox.neotoma.io";
