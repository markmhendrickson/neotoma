/**
 * AAuth client signer for outbound MCP proxy requests.
 *
 * Uses `@hellocoop/httpsig` (the same library Neotoma's CLI signer uses)
 * to produce RFC 9421 HTTP Message Signatures with an `aa-agent+jwt`
 * Signature-Key header that Neotoma's `aauthVerify` middleware expects.
 *
 * Wire format:
 *   Signature-Key:   aasig=jwt;jwt="<aa-agent+jwt>"
 *   Signature-Input: aasig=(...);created=<unix>;keyid="<jkt>";alg="ecdsa-p256-sha256"
 *   Signature:       aasig=:<base64>:
 *   Content-Digest:  sha-256=:<base64>:
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { fetch as signedFetchImpl } from "@hellocoop/httpsig";
import { SignJWT, calculateJwkThumbprint, importJWK } from "jose";
import type { JWK } from "jose";

const SIGNATURE_LABEL = "aasig";
const AAUTH_COMPONENTS_WITH_BODY = [
  "@method",
  "@authority",
  "@path",
  "content-type",
  "content-digest",
  "signature-key",
] as const;
const AAUTH_COMPONENTS_WITHOUT_BODY = ["@method", "@authority", "@path", "signature-key"] as const;

export class SignerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignerConfigError";
  }
}

export interface AAuthSignerConfig {
  privateJwk: Record<string, unknown>;
  sub: string;
  iss: string;
  kid: string;
  tokenTtlSec: number;
  authorityOverride?: string;
}

function publicPartOf(jwk: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...jwk };
  for (const field of ["d", "p", "q", "dp", "dq", "qi"] as const) {
    delete copy[field];
  }
  return copy;
}

function resolveAlg(jwk: Record<string, unknown>): "ES256" | "EdDSA" {
  if (typeof jwk.alg === "string") {
    if (jwk.alg === "ES256") return "ES256";
    if (jwk.alg === "EdDSA") return "EdDSA";
  }
  if (jwk.kty === "EC" && jwk.crv === "P-256") return "ES256";
  if (jwk.kty === "OKP" && jwk.crv === "Ed25519") return "EdDSA";
  throw new SignerConfigError(
    `Unsupported JWK for AAuth signing: kty=${String(jwk.kty)} crv=${String(jwk.crv)} alg=${String(jwk.alg)} (expected ES256 or EdDSA).`
  );
}

async function mintAgentTokenJwt(config: AAuthSignerConfig): Promise<string> {
  const alg = resolveAlg(config.privateJwk);
  const key = await importJWK(config.privateJwk as JWK, alg);
  const publicJwk = publicPartOf(config.privateJwk);
  const jkt = await calculateJwkThumbprint(publicJwk as JWK);
  const ttl = Math.max(30, config.tokenTtlSec);

  return new SignJWT({
    jkt,
    cnf: { jwk: publicJwk as JWK },
  })
    .setProtectedHeader({
      alg,
      typ: "aa-agent+jwt",
      ...(config.kid ? { kid: config.kid } : {}),
    })
    .setSubject(config.sub)
    .setIssuer(config.iss)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key);
}

/**
 * Execute a signed fetch against the downstream URL using `@hellocoop/httpsig`.
 * Explicitly override the library defaults so request bodies include
 * `content-digest`, which Neotoma's strict AAuth verifier can validate.
 */
export async function signedFetch(
  url: string,
  opts: {
    method: string;
    headers: Record<string, string>;
    body: string;
    config: AAuthSignerConfig;
  }
): Promise<Response> {
  const jwt = await mintAgentTokenJwt(opts.config);
  const targetUrl = applyAuthorityOverride(url, opts.config.authorityOverride);

  const response = (await signedFetchImpl(targetUrl, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
    signingKey: opts.config.privateJwk as unknown as JsonWebKey,
    signatureKey: { type: "jwt", jwt },
    label: SIGNATURE_LABEL,
    components: opts.body ? [...AAUTH_COMPONENTS_WITH_BODY] : [...AAUTH_COMPONENTS_WITHOUT_BODY],
  })) as Response;

  if (!response || typeof response.status !== "number") {
    throw new SignerConfigError(`signedFetch returned unexpected shape for ${url}.`);
  }
  return response;
}

function applyAuthorityOverride(url: string, authorityOverride?: string): string {
  if (!authorityOverride) return url;
  const target = new URL(url);
  const authority = /^[a-z][a-z0-9+.-]*:\/\//i.test(authorityOverride)
    ? new URL(authorityOverride)
    : new URL(`${target.protocol}//${authorityOverride}`);
  target.protocol = authority.protocol;
  target.host = authority.host;
  return target.toString();
}

function resolvePrivateJwkPath(): string {
  const explicit = process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH;
  if (explicit) return resolve(explicit);
  const cliKeyPath = resolve(homedir(), ".neotoma", "aauth", "private.jwk");
  if (existsSync(cliKeyPath)) return cliKeyPath;
  return resolve(process.cwd(), ".creds", "aauth_agent.private.jwk");
}

export function loadSignerConfigFromEnv(): AAuthSignerConfig {
  const jwkPath = resolvePrivateJwkPath();
  let raw: string;
  try {
    raw = readFileSync(jwkPath, "utf-8");
  } catch {
    throw new SignerConfigError(
      `Private JWK not found at ${jwkPath}. Run 'neotoma auth keygen' ` +
        `first or set NEOTOMA_AAUTH_PRIVATE_JWK_PATH.`
    );
  }

  let privateJwk: Record<string, unknown>;
  try {
    privateJwk = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new SignerConfigError(`Private JWK at ${jwkPath} is not valid JSON: ${String(err)}`);
  }

  let cliConfig: { sub?: string; iss?: string; kid?: string; token_ttl_sec?: number } = {};
  const cliConfigPath = resolve(homedir(), ".neotoma", "aauth", "config.json");
  if (existsSync(cliConfigPath)) {
    try {
      cliConfig = JSON.parse(readFileSync(cliConfigPath, "utf-8")) as typeof cliConfig;
    } catch {
      /* ignore malformed config */
    }
  }

  const sub = process.env.NEOTOMA_AAUTH_SUB ?? cliConfig.sub;
  const iss = process.env.NEOTOMA_AAUTH_ISS ?? cliConfig.iss;
  if (!sub)
    throw new SignerConfigError(
      "NEOTOMA_AAUTH_SUB is required for AAuth signing. Run 'neotoma auth keygen' first."
    );
  if (!iss)
    throw new SignerConfigError(
      "NEOTOMA_AAUTH_ISS is required for AAuth signing. Run 'neotoma auth keygen' first."
    );

  const kid =
    process.env.NEOTOMA_AAUTH_KID ??
    cliConfig.kid ??
    (typeof privateJwk.kid === "string" ? privateJwk.kid : undefined) ??
    "";
  if (!kid) {
    throw new SignerConfigError(
      "Could not determine kid: set NEOTOMA_AAUTH_KID or include 'kid' in the JWK."
    );
  }

  const ttlRaw = process.env.NEOTOMA_AAUTH_TOKEN_TTL_SEC ?? String(cliConfig.token_ttl_sec ?? 300);
  const ttl = Math.max(30, parseInt(ttlRaw, 10));
  if (Number.isNaN(ttl)) {
    throw new SignerConfigError(`NEOTOMA_AAUTH_TOKEN_TTL_SEC must be an integer; got '${ttlRaw}'.`);
  }

  return {
    privateJwk,
    sub,
    iss,
    kid,
    tokenTtlSec: ttl,
    authorityOverride: process.env.NEOTOMA_AAUTH_AUTHORITY_OVERRIDE || undefined,
  };
}
