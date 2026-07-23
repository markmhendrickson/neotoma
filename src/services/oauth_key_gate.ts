import { readFileSync } from "fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { deriveMcpAuthToken, hexToKey, mnemonicToSeed } from "../crypto/key_derivation.js";

/**
 * Default lifetime for a KEY-ENTRY gate session — the short window in which a
 * user pastes a private key / mnemonic / bearer token. Deliberately brief.
 *
 * Sign-in sessions are a different concern with a different expectation (a user
 * signed in with Google expects to stay signed in), so callers pass their own
 * TTL rather than inheriting this one. See SIGN_IN_SESSION_TTL_MS in actions.ts
 * and issue #2005 — reusing this 15-minute default for Google sign-in is what
 * logged hosted-instance users out every quarter hour.
 */
const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;

export type OAuthKeyCredentials = {
  privateKeyHex?: string;
  mnemonic?: string;
  mnemonicPassphrase?: string;
  bearerToken?: string;
};

export class OAuthKeySessionStore {
  private readonly sessions = new Map<string, number>();
  /**
   * Optional user binding for a session (set by the Google sign-in callback).
   * Kept in the SAME store as the expiry so a bound user can never outlive its
   * session — a separate module-level map had no TTL and grew unbounded (#2005).
   */
  private readonly boundUsers = new Map<string, string>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /** Create a session. `ttlMsOverride` lets a caller (e.g. sign-in) use a
   *  longer lifetime than the short key-entry default. */
  create(nowMs: number = Date.now(), ttlMsOverride?: number): string {
    this.cleanup(nowMs);
    const token = randomUUID();
    const ttl = ttlMsOverride != null && ttlMsOverride > 0 ? ttlMsOverride : this.ttlMs;
    this.sessions.set(token, nowMs + ttl);
    return token;
  }

  isValid(token: string | undefined, nowMs: number = Date.now()): boolean {
    if (!token) return false;
    const expiresAt = this.sessions.get(token);
    if (expiresAt == null) return false;
    if (expiresAt <= nowMs) {
      this.sessions.delete(token);
      this.boundUsers.delete(token);
      return false;
    }
    return true;
  }

  /** Bind a resolved user_id to a live session. No-op for an invalid token, so
   *  a binding can never resurrect or outlast an expired session. */
  bindUser(token: string, userId: string, nowMs: number = Date.now()): boolean {
    if (!this.isValid(token, nowMs)) return false;
    this.boundUsers.set(token, userId);
    return true;
  }

  /** Resolve the bound user for a session, or undefined when the session is
   *  absent/expired. Expiry is enforced here, not just at write time. */
  getBoundUser(token: string | undefined, nowMs: number = Date.now()): string | undefined {
    if (!token) return undefined;
    if (!this.isValid(token, nowMs)) return undefined;
    return this.boundUsers.get(token);
  }

  cleanup(nowMs: number = Date.now()): void {
    for (const [token, expiresAt] of this.sessions.entries()) {
      if (expiresAt <= nowMs) {
        this.sessions.delete(token);
        this.boundUsers.delete(token);
      }
    }
  }
}

export function getConfiguredOAuthKeyToken(): string | null {
  const keyFilePath = config.encryption.keyFilePath || "";
  const mnemonic = config.encryption.mnemonic || "";
  const mnemonicPassphrase = config.encryption.mnemonicPassphrase || "";

  if (keyFilePath) {
    const raw = readFileSync(keyFilePath, "utf8").trim();
    return deriveMcpAuthToken(hexToKey(raw));
  }
  if (mnemonic) {
    const seed = mnemonicToSeed(mnemonic, mnemonicPassphrase);
    return deriveMcpAuthToken(seed);
  }
  return null;
}

export function deriveOAuthKeyTokenFromCredentials(credentials: OAuthKeyCredentials): string {
  const privateKeyHex = credentials.privateKeyHex?.trim() || "";
  const mnemonic = credentials.mnemonic?.trim() || "";
  const mnemonicPassphrase = credentials.mnemonicPassphrase || "";

  if (privateKeyHex) {
    return deriveMcpAuthToken(hexToKey(privateKeyHex));
  }
  if (mnemonic) {
    const seed = mnemonicToSeed(mnemonic, mnemonicPassphrase);
    return deriveMcpAuthToken(seed);
  }
  throw new Error("Provide private_key_hex or mnemonic");
}

export function isOauthKeyCredentialValid(credentials: OAuthKeyCredentials): {
  ok: boolean;
  reason?: string;
} {
  const bearerToken = credentials.bearerToken?.trim() || "";
  const configuredBearer = (process.env.NEOTOMA_BEARER_TOKEN || "").trim();
  if (bearerToken) {
    if (!configuredBearer) {
      return {
        ok: false,
        reason:
          "Bearer token authentication is not configured on this server. Set NEOTOMA_BEARER_TOKEN or use key credentials.",
      };
    }
    const expected = Buffer.from(configuredBearer, "utf8");
    const provided = Buffer.from(bearerToken, "utf8");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      return { ok: false, reason: "Provided bearer token does not match configured token" };
    }
    return { ok: true };
  }

  const expectedToken = getConfiguredOAuthKeyToken();
  if (!expectedToken) {
    return {
      ok: false,
      reason:
        "OAuth key-auth is required but no key source is configured. Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC, or use NEOTOMA_BEARER_TOKEN without OAuth.",
    };
  }

  let providedToken: string;
  try {
    providedToken = deriveOAuthKeyTokenFromCredentials(credentials);
  } catch (error: any) {
    return { ok: false, reason: error?.message || "Invalid key credentials" };
  }

  const expected = Buffer.from(expectedToken, "utf8");
  const provided = Buffer.from(providedToken, "utf8");
  if (expected.length !== provided.length) {
    return { ok: false, reason: "Provided key does not match configured key" };
  }
  if (!timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "Provided key does not match configured key" };
  }
  return { ok: true };
}

export function normalizeOauthNextPath(nextRaw: string | undefined): string {
  if (!nextRaw) return "/mcp/oauth/authorize";
  const trimmed = nextRaw.trim();
  if (!trimmed) return "/mcp/oauth/authorize";
  if (!trimmed.startsWith("/")) return "/mcp/oauth/authorize";
  if (!trimmed.startsWith("/mcp/oauth/")) return "/mcp/oauth/authorize";
  return trimmed;
}
