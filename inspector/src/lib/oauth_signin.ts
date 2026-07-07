/**
 * Client-side OAuth sign-in for the Inspector SPA.
 *
 * Neotoma's `/mcp/oauth/*` surface (RFC 8414 discovery + RFC 7591 dynamic
 * client registration + PKCE authorization code flow) was built for MCP
 * clients (Claude, Cursor, ChatGPT) but is a standards-compliant public
 * OAuth client flow — `token_endpoint_auth_methods_supported: ["none"]` in
 * `/.well-known/oauth-authorization-server` means no client secret is
 * expected, which is exactly what a browser SPA needs. This module makes the
 * Inspector act as its own OAuth client:
 *
 *   1. {@link startOAuthSignIn} generates a PKCE verifier/challenge + state,
 *      stashes them in sessionStorage, and navigates the browser to
 *      `/mcp/oauth/authorize`. The server's existing `/mcp/oauth/key-auth`
 *      preflight page (private key / mnemonic / bearer token / "Sign in with
 *      Google" tabs, all server-rendered) handles the actual credential
 *      check — this module does not reimplement or bypass it.
 *   2. The server redirects back to this app's own `redirect_uri`
 *      (`${origin}/oauth/callback`) with `?code=...&state=...`.
 *   3. {@link completeOAuthSignIn} verifies `state`, exchanges `code` (+ the
 *      stashed `code_verifier`) for an `access_token` via `POST
 *      /mcp/oauth/token`, and stores it exactly like a pasted bearer token
 *      (`setAuthToken`) so every existing API call authenticates the same
 *      way it already does for the manual bearer-token path.
 *
 * KNOWN GAP (documented, not silently papered over): Neotoma's local storage
 * backend restricts `redirect_uri` to localhost / loopback / a fixed allow-
 * list of hosted app callbacks (chatgpt.com, claude.ai) whenever the
 * authorize request does not originate from a genuine loopback socket (see
 * `isRedirectUriAllowedForTunnel` in `src/services/mcp_oauth.ts`). A same-
 * origin Inspector callback served over a tunnel/public origin is NOT on
 * that allowlist today, so `/mcp/oauth/authorize` will 400 in that specific
 * deployment shape until the server allowlists the Inspector's own origin
 * (or `NEOTOMA_TRUST_PROD_LOOPBACK` applies). This flow works today when the
 * Inspector is served from `localhost` (local dev) and is written to work
 * unmodified once the server-side allowlist is extended — no client change
 * needed for that follow-up.
 */

import { setApiUrl, setAuthToken, getApiUrl } from "@/api/client";

const PKCE_STORAGE_KEY = "neotoma_inspector_oauth_pkce";
const RETURN_PATH_STORAGE_KEY = "neotoma_inspector_oauth_return_path";
const OAUTH_CALLBACK_PATH = "/oauth/callback";

interface StoredPkce {
  codeVerifier: string;
  state: string;
  /** Origin the flow was started against, so callback can detect a mismatch. */
  apiBase: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** True when the browser can run the PKCE S256 challenge (Web Crypto + secure context). */
export function isOAuthSignInSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

function redirectUri(): string {
  return `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
}

/**
 * Kick off the OAuth sign-in flow: generate PKCE + state, persist them for
 * the callback, and navigate the browser to `/mcp/oauth/authorize` on the
 * currently-configured API base. Does not return — navigates away.
 */
export async function startOAuthSignIn(options?: { returnPath?: string }): Promise<void> {
  if (!isOAuthSignInSupported()) {
    throw new Error("OAuth sign-in requires a secure context (HTTPS or localhost).");
  }
  const apiBase = getApiUrl().replace(/\/$/, "");
  if (!apiBase) {
    throw new Error("Set an API Base URL before signing in.");
  }

  const codeVerifier = randomString(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(16);

  const stored: StoredPkce = { codeVerifier, state, apiBase };
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(stored));
  sessionStorage.setItem(
    RETURN_PATH_STORAGE_KEY,
    options?.returnPath || window.location.pathname + window.location.search
  );

  const params = new URLSearchParams({
    redirect_uri: redirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    client_id: "neotoma-inspector",
  });
  window.location.assign(`${apiBase}/mcp/oauth/authorize?${params.toString()}`);
}

export type OAuthCallbackResult =
  | { kind: "success"; returnPath: string }
  | { kind: "error"; message: string; returnPath: string };

/**
 * Complete the flow after the server redirects back to `/oauth/callback`.
 * Reads `code`/`state`/`error` from the given search params, validates
 * `state` against what {@link startOAuthSignIn} stashed, exchanges the code
 * for an access token, and stores it via the same `setAuthToken` helper the
 * manual bearer-token field uses.
 */
export async function completeOAuthSignIn(search: URLSearchParams): Promise<OAuthCallbackResult> {
  const fallbackReturnPath = sessionStorage.getItem(RETURN_PATH_STORAGE_KEY) || "/settings";

  const errorParam = search.get("error");
  if (errorParam) {
    const description = search.get("error_description") || errorParam;
    return { kind: "error", message: description, returnPath: fallbackReturnPath };
  }

  const code = search.get("code");
  const state = search.get("state");
  if (!code || !state) {
    return {
      kind: "error",
      message: "Sign-in callback is missing an authorization code.",
      returnPath: fallbackReturnPath,
    };
  }

  const rawStored = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!rawStored) {
    return {
      kind: "error",
      message:
        "No sign-in attempt in progress for this browser session. Start again from Settings.",
      returnPath: fallbackReturnPath,
    };
  }

  let stored: StoredPkce;
  try {
    stored = JSON.parse(rawStored) as StoredPkce;
  } catch {
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
    return {
      kind: "error",
      message: "Sign-in state could not be read. Start again from Settings.",
      returnPath: fallbackReturnPath,
    };
  }

  if (stored.state !== state) {
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
    return {
      kind: "error",
      message:
        "Sign-in state did not match (possible replay or stale link). Start again from Settings.",
      returnPath: fallbackReturnPath,
    };
  }

  sessionStorage.removeItem(PKCE_STORAGE_KEY);
  sessionStorage.removeItem(RETURN_PATH_STORAGE_KEY);

  try {
    const tokenRes = await fetch(`${stored.apiBase}/mcp/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "include",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        code_verifier: stored.codeVerifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      let description = body;
      try {
        const parsed = JSON.parse(body) as { error_description?: string; error?: string };
        description = parsed.error_description || parsed.error || body;
      } catch {
        // not JSON; use raw body
      }
      return {
        kind: "error",
        message: description || `Token exchange failed (HTTP ${tokenRes.status}).`,
        returnPath: fallbackReturnPath,
      };
    }

    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      return {
        kind: "error",
        message: "Sign-in succeeded but the server did not return an access token.",
        returnPath: fallbackReturnPath,
      };
    }

    setApiUrl(stored.apiBase);
    setAuthToken(token.access_token);
    return { kind: "success", returnPath: fallbackReturnPath };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Token exchange failed.",
      returnPath: fallbackReturnPath,
    };
  }
}

export { OAUTH_CALLBACK_PATH };
