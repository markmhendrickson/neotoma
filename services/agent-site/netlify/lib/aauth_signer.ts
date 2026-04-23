/**
 * AAuth signer for agent-site service-to-service requests.
 *
 * Produces RFC 9421 HTTP Message Signatures for outbound requests to the
 * local Neotoma API (via the Cloudflare Named Tunnel). The `signedFetch`
 * wrapper delegates to `@hellocoop/httpsig.fetch`, which computes the
 * content-digest, signature-input, and signature headers for us. We supply:
 *
 *   - `signingKey`        — private JWK loaded from `AGENT_SITE_AAUTH_PRIVATE_JWK`.
 *   - `signatureKey`      — `{ type: "jwt", jwt }` where `jwt` is the
 *     `aa-agent+jwt` agent token signed with the same key. The public JWK
 *     is published at `agent.neotoma.io/.well-known/jwks.json` via
 *     `services/agent-site/netlify/functions/jwks.ts`.
 *
 * The private JWK never leaves Netlify env. Public key discovery happens
 * out-of-band via JWKS so Neotoma can rotate signing keys without a code
 * change on either side.
 */

import { fetch as signedFetchImpl } from "@hellocoop/httpsig";
import { SignJWT, calculateJwkThumbprint, importJWK } from "jose";

export interface SignerConfig {
  /** Private signing JWK. Parsed from `AGENT_SITE_AAUTH_PRIVATE_JWK`. */
  privateJwk: Record<string, unknown>;
  /** AAuth subject — the self-reported identity. */
  sub: string;
  /** AAuth issuer — the JWKS host. */
  iss: string;
  /** Optional explicit `kid`; falls back to the value embedded in the JWK. */
  kid?: string;
  /** Agent-token JWT lifetime (default 300s). */
  tokenTtlSec?: number;
}

export class SignerConfigError extends Error {
  readonly code = "signer_misconfigured" as const;
}

/**
 * Load the signer configuration from env. Throws {@link SignerConfigError}
 * when required variables are missing. Callers should treat a throw as a
 * terminal "can't sign" signal and bail the forward attempt.
 */
export function loadSignerConfigFromEnv(): SignerConfig {
  const privateRaw = process.env.AGENT_SITE_AAUTH_PRIVATE_JWK;
  if (!privateRaw) {
    throw new SignerConfigError(
      "AGENT_SITE_AAUTH_PRIVATE_JWK is not set — cannot sign outbound requests.",
    );
  }
  let privateJwk: Record<string, unknown>;
  try {
    privateJwk = JSON.parse(privateRaw) as Record<string, unknown>;
  } catch (err) {
    throw new SignerConfigError(
      `AGENT_SITE_AAUTH_PRIVATE_JWK is not valid JSON: ${(err as Error).message}`,
    );
  }

  const sub =
    process.env.AGENT_SITE_AAUTH_SUB ??
    process.env.AGENT_SITE_NEOTOMA_AGENT_LABEL ??
    "agent-site@neotoma.io";
  const iss =
    process.env.AGENT_SITE_AAUTH_ISS ?? "https://agent.neotoma.io";
  const kid =
    process.env.AGENT_SITE_AAUTH_KID ??
    (typeof privateJwk.kid === "string" ? (privateJwk.kid as string) : undefined);

  return {
    privateJwk,
    sub,
    iss,
    kid,
    tokenTtlSec: Number.parseInt(
      process.env.AGENT_SITE_AAUTH_TOKEN_TTL_SEC ?? "300",
      10,
    ),
  };
}

/**
 * Pick the RFC 7518 `alg` appropriate for a JWK. We only support the two
 * algorithms listed in the AAuth profile (ES256, EdDSA) — anything else is
 * rejected so a misconfigured key can't silently downgrade the attribution
 * tier to `software` instead of `hardware`.
 */
function resolveAlg(jwk: Record<string, unknown>): "ES256" | "EdDSA" {
  if (typeof jwk.alg === "string") {
    if (jwk.alg === "ES256") return "ES256";
    if (jwk.alg === "EdDSA") return "EdDSA";
  }
  if (jwk.kty === "EC" && jwk.crv === "P-256") return "ES256";
  if (jwk.kty === "OKP" && jwk.crv === "Ed25519") return "EdDSA";
  throw new SignerConfigError(
    `Unsupported JWK for AAuth signing: kty=${String(jwk.kty)} crv=${String(
      jwk.crv,
    )} alg=${String(jwk.alg)}`,
  );
}

function publicPartOf(jwk: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...jwk };
  for (const field of ["d", "p", "q", "dp", "dq", "qi"] as const) {
    delete copy[field];
  }
  return copy;
}

/** Build and sign an `aa-agent+jwt` agent token with the configured key. */
async function mintAgentTokenJwt(config: SignerConfig): Promise<string> {
  const alg = resolveAlg(config.privateJwk);
  const key = await importJWK(config.privateJwk as Parameters<typeof importJWK>[0], alg);
  const publicJwk = publicPartOf(config.privateJwk);
  const jkt = await calculateJwkThumbprint(
    publicJwk as Parameters<typeof calculateJwkThumbprint>[0],
  );
  const ttl = Math.max(30, config.tokenTtlSec ?? 300);
  const builder = new SignJWT({ jkt })
    .setProtectedHeader({
      alg,
      typ: "aa-agent+jwt",
      ...(config.kid ? { kid: config.kid } : {}),
    })
    .setSubject(config.sub)
    .setIssuer(config.iss)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`);
  return builder.sign(key);
}

export interface SignedFetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** Override for tests. */
  configOverride?: SignerConfig;
}

/**
 * Signed fetch. Merges the AAuth-signed headers (authorization, signature,
 * signature-input, signature-key, content-digest, date) onto the provided
 * headers and performs the fetch. Throws on signer misconfiguration so the
 * forwarder can surface a clear reason rather than silently falling back
 * to an unsigned request.
 */
export async function signedFetch(
  url: string,
  options: SignedFetchOptions,
): Promise<Response> {
  const config = options.configOverride ?? loadSignerConfigFromEnv();
  const alg = resolveAlg(config.privateJwk);
  const jwt = await mintAgentTokenJwt(config);

  const response = (await signedFetchImpl(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: options.signal,
    // Cast through unknown: @hellocoop/httpsig expects a JsonWebKey but
    // the WebCrypto-like shape is identical to the Node shape we receive.
    signingKey: config.privateJwk as unknown as JsonWebKey,
    signatureKey: { type: "jwt", jwt },
    label: "aasig",
    // Ensure the `alg` selection is audit-visible; httpsig derives it from
    // the key but logs it for operators.
  })) as Response;

  // Sanity check that we actually received a Response (fetch wrapper can
  // return `{ headers }` in dryRun mode — we never request that).
  if (!response || typeof (response as Response).status !== "number") {
    throw new SignerConfigError(
      `signedFetch returned unexpected shape (alg=${alg}).`,
    );
  }
  return response as Response;
}

/** Testing hook: re-export so consumers don't need to import jose directly. */
export { calculateJwkThumbprint };
