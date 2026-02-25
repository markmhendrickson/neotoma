import { readFileSync } from "fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { deriveMcpAuthToken, hexToKey, mnemonicToSeed } from "../crypto/key_derivation.js";

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;

export type OAuthKeyCredentials = {
  privateKeyHex?: string;
  mnemonic?: string;
  mnemonicPassphrase?: string;
};

export class OAuthKeySessionStore {
  private readonly sessions = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  create(nowMs: number = Date.now()): string {
    this.cleanup(nowMs);
    const token = randomUUID();
    this.sessions.set(token, nowMs + this.ttlMs);
    return token;
  }

  isValid(token: string | undefined, nowMs: number = Date.now()): boolean {
    if (!token) return false;
    const expiresAt = this.sessions.get(token);
    if (expiresAt == null) return false;
    if (expiresAt <= nowMs) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  cleanup(nowMs: number = Date.now()): void {
    for (const [token, expiresAt] of this.sessions.entries()) {
      if (expiresAt <= nowMs) this.sessions.delete(token);
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
