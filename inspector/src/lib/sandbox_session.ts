/**
 * Client-side helpers for the sandbox -> inspector session handoff.
 *
 * Flow:
 *
 * 1. The landing page at `/` renders a pack picker, posts to
 *    `/sandbox/session/new`, and redirects the browser to
 *    `/inspector#session=<code>`.
 * 2. On startup, the Inspector reads that hash, POSTs it to
 *    `/sandbox/session/redeem` (same origin), and stashes `{apiUrl, authToken}`
 *    via the existing `setApiUrl` / `setAuthToken` helpers.
 * 3. The hash is cleared so a refresh does not replay the (now-consumed) code.
 *
 * The session record (user_id, pack_id, expires_at) is kept in
 * `sessionStorage` so banners can render a countdown without a round trip.
 *
 * This module is transport-agnostic (takes `fetch` as a dep) so tests can
 * exercise it without a real network.
 */

import { clearApiUrl, clearAuthToken, setApiUrl, setAuthToken } from "@/api/client";

export const SANDBOX_SESSION_STORAGE_KEY = "neotoma_inspector_sandbox_session";
const HASH_PARAM_SESSION = "session";

export interface SandboxSessionDescriptor {
  userId: string;
  packId: string;
  apiBase: string;
  expiresAt: string;
  /** When the session was redeemed (ISO). Used for banner countdown math. */
  redeemedAt: string;
}

export interface SandboxRedeemResponse {
  bearer_token: string;
  user_id: string;
  expires_at: string;
  pack_id: string;
}

export function readStoredSandboxSession(): SandboxSessionDescriptor | null {
  try {
    const raw = sessionStorage.getItem(SANDBOX_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SandboxSessionDescriptor>;
    if (!parsed.userId || !parsed.apiBase || !parsed.expiresAt) return null;
    return {
      userId: parsed.userId,
      packId: parsed.packId || "",
      apiBase: parsed.apiBase,
      expiresAt: parsed.expiresAt,
      redeemedAt: parsed.redeemedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function storeSandboxSession(descriptor: SandboxSessionDescriptor): void {
  try {
    sessionStorage.setItem(SANDBOX_SESSION_STORAGE_KEY, JSON.stringify(descriptor));
  } catch {
    // sessionStorage may be disabled (private mode, iframe, etc.). The session
    // still works as long as the bearer token is in localStorage.
  }
}

export function clearSandboxSession(): void {
  try {
    sessionStorage.removeItem(SANDBOX_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface HashPayload {
  code: string;
}

export function parseSessionHash(hash: string): HashPayload | null {
  if (!hash) return null;
  const trimmed = hash.replace(/^#/, "");
  if (!trimmed) return null;
  const params = new URLSearchParams(trimmed);
  const code = params.get(HASH_PARAM_SESSION);
  if (!code) return null;
  return { code };
}

/**
 * Strip `session` and `base` from the current URL hash without a reload so
 * a back button / refresh cannot replay the consumed code.
 */
function scrubHash(): void {
  if (typeof window === "undefined" || !window.location.hash) return;
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    params.delete(HASH_PARAM_SESSION);
    const rest = params.toString();
    const url = window.location.pathname + window.location.search + (rest ? `#${rest}` : "");
    window.history.replaceState(null, "", url);
  } catch {
    // best effort
  }
}

export interface RedeemSandboxSessionOptions {
  /** Hash code extracted from the URL. */
  code: string;
  /**
   * Injectable fetch for tests. Defaults to the global `fetch`.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Exchange a one-time handoff code for a live bearer. Uses relative URLs
 * (same-origin). On success, persists `apiUrl` + `authToken` via the
 * Inspector's existing storage layer and returns the session descriptor.
 */
export async function redeemSandboxSession(
  options: RedeemSandboxSessionOptions,
): Promise<SandboxSessionDescriptor> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl("/sandbox/session/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code: options.code }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Sandbox session redeem failed (HTTP ${res.status}): ${body.slice(0, 200) || "no body"}`,
    );
  }
  const data = (await res.json()) as SandboxRedeemResponse;
  if (!data.bearer_token || !data.user_id) {
    throw new Error("Sandbox session redeem returned no bearer_token");
  }
  setApiUrl(window.location.origin);
  setAuthToken(data.bearer_token);
  const descriptor: SandboxSessionDescriptor = {
    userId: data.user_id,
    packId: data.pack_id,
    apiBase: window.location.origin,
    expiresAt: data.expires_at,
    redeemedAt: new Date().toISOString(),
  };
  storeSandboxSession(descriptor);
  return descriptor;
}

export type HandoffOutcome =
  | { kind: "noop" }
  | { kind: "redeemed"; descriptor: SandboxSessionDescriptor }
  | { kind: "failed"; error: Error };

/**
 * Boot-time hook: if the URL hash carries `session=<code>`, redeem it and
 * reload the app so route-level data loaders pick up the new token. Safe to
 * call multiple times — the hash is scrubbed after the first success.
 */
export async function consumeSandboxSessionHandoff(options?: {
  fetchImpl?: typeof fetch;
  /**
   * Called after a successful redeem with the descriptor; defaults to
   * reloading the window so the Inspector hydrates with the new bearer.
   */
  onRedeemed?: (descriptor: SandboxSessionDescriptor) => void;
}): Promise<HandoffOutcome> {
  if (typeof window === "undefined") return { kind: "noop" };
  const parsed = parseSessionHash(window.location.hash);
  if (!parsed) return { kind: "noop" };
  try {
    const descriptor = await redeemSandboxSession({
      code: parsed.code,
      fetchImpl: options?.fetchImpl,
    });
    scrubHash();
    if (options?.onRedeemed) {
      options.onRedeemed(descriptor);
    } else {
      window.location.reload();
    }
    return { kind: "redeemed", descriptor };
  } catch (err) {
    scrubHash();
    return { kind: "failed", error: err as Error };
  }
}

/**
 * Forget the current sandbox session client-side. Callers that also want to
 * hard-delete the server-side data should first POST `DELETE /sandbox/session`
 * — this helper only clears the Inspector's local state.
 */
export function forgetSandboxSessionClient(): void {
  clearSandboxSession();
  clearApiUrl();
  clearAuthToken();
}

/**
 * Compute the remaining lifetime of a descriptor. Returns 0 when expired.
 */
export function remainingSessionMs(
  descriptor: SandboxSessionDescriptor,
  now: Date = new Date(),
): number {
  const expiresAt = Date.parse(descriptor.expiresAt);
  if (Number.isNaN(expiresAt)) return 0;
  return Math.max(0, expiresAt - now.getTime());
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}
