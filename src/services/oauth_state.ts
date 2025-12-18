import { randomBytes, createHash } from "node:crypto";

interface OAuthStateEntry {
  provider: string;
  codeVerifier: string;
  bearerToken: string;
  redirectTo?: string;
  createdAt: number;
}

interface CreateOAuthStateInput {
  provider: string;
  bearerToken: string;
  redirectTo?: string;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const stateStore = new Map<string, OAuthStateEntry>();

export function createOAuthState(input: CreateOAuthStateInput): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  purgeExpired();

  const state = randomString(24);
  const codeVerifier = randomString(64);
  const codeChallenge = pkceChallenge(codeVerifier);

  stateStore.set(state, {
    provider: input.provider,
    codeVerifier,
    bearerToken: input.bearerToken,
    redirectTo: input.redirectTo,
    createdAt: Date.now(),
  });

  return { state, codeVerifier, codeChallenge };
}

export function consumeOAuthState(state: string): OAuthStateEntry | null {
  purgeExpired();
  const entry = stateStore.get(state);
  if (!entry) {
    return null;
  }
  stateStore.delete(state);
  return entry;
}

function purgeExpired() {
  const now = Date.now();
  for (const [state, entry] of stateStore.entries()) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(state);
    }
  }
}

function randomString(length = 32): string {
  return randomBytes(length)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, length);
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
