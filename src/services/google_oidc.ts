/**
 * Google OpenID Connect sign-in for the OAuth key-auth page.
 *
 * AUTH-LAYER ONLY. This module answers exactly one question: "which
 * verified Google email is this?" It does not decide, and must never be
 * extended to decide, whether users share a graph — that is a separate,
 * still-open decision (Option B / org-namespace, `NEOTOMA_ORG_NAMESPACE`).
 * Callers resolve the verified email to a user_id via the existing
 * per-email primitive (`createLocalAuthUser` / `hashEmailToUserId` in
 * `local_auth.ts`) and complete OAuth exactly like the key-auth path does
 * today, admitting the person as their own isolated user.
 *
 * Feature-flagged: the Google sign-in path is only enabled when both
 * `NEOTOMA_GOOGLE_CLIENT_ID` and `NEOTOMA_APPROVED_EMAILS` are set. When
 * either is unset, `isGoogleSigninEnabled()` returns false and callers must
 * not surface or accept the Google path at all — every other deploy is
 * byte-for-byte unchanged.
 *
 * | Env var | Shape | Purpose |
 * |---|---|---|
 * | `NEOTOMA_GOOGLE_CLIENT_ID` | string | OAuth client id registered with Google |
 * | `NEOTOMA_GOOGLE_CLIENT_SECRET` | string | OAuth client secret (server-side code exchange) |
 * | `NEOTOMA_APPROVED_EMAILS` | CSV of emails | Allowlist; lowercased + trimmed; cached |
 *
 * Matching is case-insensitive because email addresses are (RFC 5321
 * local-parts are technically case-sensitive, but in practice — and
 * specifically for Google Workspace/Gmail accounts, the only accounts this
 * flow will ever see — they are not). This mirrors the general convention
 * elsewhere in local_auth.ts (`normalizeEmail`), and deliberately diverges
 * from aauth_operator_allowlist.ts's case-sensitive issuer matching, which
 * exists for opaque, case-meaningful issuer identifiers rather than emails.
 */

import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes, matches mcp_oauth.ts STATE_TTL_MS order of magnitude

let cachedAllowlist: ReadonlySet<string> | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export interface VerifiedGoogleIdentity {
  email: string;
  emailVerified: boolean;
}

export class GoogleIdTokenError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BAD_SIGNATURE"
      | "BAD_ISSUER"
      | "BAD_AUDIENCE"
      | "EXPIRED"
      | "EMAIL_NOT_VERIFIED"
      | "EMAIL_NOT_APPROVED"
      | "NOT_CONFIGURED"
  ) {
    super(message);
    this.name = "GoogleIdTokenError";
  }
}

/** Test helper. Production code never invokes. */
export function resetGoogleOidcCacheForTests(): void {
  cachedAllowlist = null;
  cachedJwks = null;
  nonceStore.clear();
}

/**
 * CSRF-nonce store for the Google leg of the redirect. Not to be confused
 * with the Neotoma-native OAuth `state` (see `oauth_key_gate.ts`'s
 * `next` param and `mcp_oauth.ts`'s local-authorization `state`) — that
 * value is carried through unchanged as the `next` query param on our own
 * callback URL, exactly like the existing key-auth POST handler does.
 * This nonce only protects the hop out to, and back from, Google.
 */
interface GoogleNonceEntry {
  next: string;
  expiresAt: number;
}
const nonceStore = new Map<string, GoogleNonceEntry>();

function purgeExpiredNonces(nowMs: number): void {
  for (const [nonce, entry] of nonceStore.entries()) {
    if (entry.expiresAt <= nowMs) nonceStore.delete(nonce);
  }
}

/** Issue a fresh CSRF nonce bound to the `next` path the caller wants to resume after sign-in. */
export function createGoogleSigninNonce(next: string): string {
  const nowMs = Date.now();
  purgeExpiredNonces(nowMs);
  const nonce = randomUUID();
  nonceStore.set(nonce, { next, expiresAt: nowMs + NONCE_TTL_MS });
  return nonce;
}

/** Consume (single-use) a previously issued nonce. Returns null if unknown/expired/already used. */
export function consumeGoogleSigninNonce(nonce: string): { next: string } | null {
  purgeExpiredNonces(Date.now());
  const entry = nonceStore.get(nonce);
  if (!entry) return null;
  nonceStore.delete(nonce);
  return { next: entry.next };
}

function parseCsvEmailSet(value: string | undefined): ReadonlySet<string> {
  if (!value) return new Set();
  const out = new Set<string>();
  for (const entry of value.split(",")) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed.length === 0) continue;
    out.add(trimmed);
  }
  return out;
}

function ensureAllowlistLoaded(): ReadonlySet<string> {
  if (cachedAllowlist) return cachedAllowlist;
  cachedAllowlist = parseCsvEmailSet(process.env.NEOTOMA_APPROVED_EMAILS);
  return cachedAllowlist;
}

/** Public lookup: is this (already-normalized) email on the approved list? */
export function isEmailApproved(email: string): boolean {
  const normalized = (email || "").trim().toLowerCase();
  if (normalized.length === 0) return false;
  return ensureAllowlistLoaded().has(normalized);
}

/**
 * Whether the Google sign-in path should be offered/accepted at all.
 * Both the client id and the approved-email allowlist must be configured;
 * otherwise this feature stays completely dark and existing key-auth
 * behavior is unchanged.
 */
export function isGoogleSigninEnabled(): boolean {
  const clientId = (process.env.NEOTOMA_GOOGLE_CLIENT_ID || "").trim();
  const approved = (process.env.NEOTOMA_APPROVED_EMAILS || "").trim();
  return clientId.length > 0 && approved.length > 0;
}

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  return cachedJwks;
}

/**
 * Build the URL to redirect the browser to Google's authorization
 * endpoint. `redirectUri` must be the exact callback URL registered with
 * this Google OAuth client (the instance's own `/mcp/oauth/google/callback`
 * origin) and `nonce` must be a value from `createGoogleSigninNonce`.
 */
export function buildGoogleAuthorizeUrl(params: { redirectUri: string; nonce: string }): string {
  const clientId = (process.env.NEOTOMA_GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    throw new GoogleIdTokenError("NEOTOMA_GOOGLE_CLIENT_ID is not configured", "NOT_CONFIGURED");
  }
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", params.nonce);
  // prompt=select_account avoids silently reusing a stale Google session that
  // may belong to a different (non-approved) account on a shared browser.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Exchange an authorization `code` from Google's callback for tokens, and
 * return the raw `id_token` JWT (still unverified at this point — callers
 * MUST pass it to `verifyGoogleIdToken` before trusting any claim in it).
 */
export async function exchangeGoogleAuthorizationCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{ idToken: string }> {
  const clientId = (process.env.NEOTOMA_GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.NEOTOMA_GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new GoogleIdTokenError(
      "NEOTOMA_GOOGLE_CLIENT_ID / NEOTOMA_GOOGLE_CLIENT_SECRET are not configured",
      "NOT_CONFIGURED"
    );
  }

  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GoogleIdTokenError(
      `Google token exchange failed (${response.status}): ${text.slice(0, 300)}`,
      "BAD_SIGNATURE"
    );
  }

  const json = (await response.json()) as { id_token?: string };
  if (!json.id_token || typeof json.id_token !== "string") {
    throw new GoogleIdTokenError(
      "Google token response did not include an id_token",
      "BAD_SIGNATURE"
    );
  }

  return { idToken: json.id_token };
}

/**
 * Verify a Google-issued `id_token` (JWT) against Google's live JWKS,
 * checking signature, issuer, audience (our configured client id), and
 * expiry (all handled by `jose`'s `jwtVerify`), then requires
 * `email_verified` and allowlist membership.
 *
 * Returns the verified, normalized email on success. Throws
 * `GoogleIdTokenError` with a specific `code` on any rejection — never
 * returns a partially-trusted result.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
  const clientId = (process.env.NEOTOMA_GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    throw new GoogleIdTokenError("NEOTOMA_GOOGLE_CLIENT_ID is not configured", "NOT_CONFIGURED");
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(idToken, getJwks(), {
      issuer: Array.from(GOOGLE_ISSUERS),
      audience: clientId,
    });
    payload = result.payload as Record<string, unknown>;
  } catch (error: any) {
    const code = error?.code as string | undefined;
    if (code === "ERR_JWT_EXPIRED") {
      throw new GoogleIdTokenError("Google id_token is expired", "EXPIRED");
    }
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && error?.claim === "iss") {
      throw new GoogleIdTokenError(
        "Google id_token issuer is not accounts.google.com",
        "BAD_ISSUER"
      );
    }
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && error?.claim === "aud") {
      throw new GoogleIdTokenError(
        "Google id_token audience does not match configured client id",
        "BAD_AUDIENCE"
      );
    }
    throw new GoogleIdTokenError(
      `Google id_token signature verification failed: ${error?.message || error}`,
      "BAD_SIGNATURE"
    );
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";

  if (!email || !emailVerified) {
    throw new GoogleIdTokenError("Google account email is not verified", "EMAIL_NOT_VERIFIED");
  }

  if (!isEmailApproved(email)) {
    throw new GoogleIdTokenError(
      `Email ${email} is not on the approved allowlist`,
      "EMAIL_NOT_APPROVED"
    );
  }

  return { email, emailVerified: true };
}
