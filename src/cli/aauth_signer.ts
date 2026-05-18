/**
 * Local AAuth signer (`~/.neotoma/aauth/`).
 *
 * Mirrors `services/agent-site/netlify/lib/aauth_signer.ts` but sources the
 * private JWK from a keypair on disk at `~/.neotoma/aauth/private.jwk`.
 * Used by:
 *
 *   - `neotoma auth keygen` to generate the keypair.
 *   - `neotoma auth sign-example` to print a debugging curl.
 *   - `createApiClient` in `src/shared/api_client.ts` when a keypair is
 *     configured, so outbound CLI requests carry an AAuth signature and
 *     land as `hardware` / `software` tier instead of `anonymous`.
 *   - `neotoma mcp proxy --aauth` and the signed MCP dev shim, which read
 *     the same directory so Cursor (stdio MCP) and the CLI share one agent
 *     identity unless overridden with env vars.
 *
 * The private JWK never leaves the user's machine. Public-key discovery
 * happens out-of-band: the server verifies signatures against the
 * `jkt` thumbprint baked into the `aa-agent+jwt` agent token, so there
 * is no JWKS to publish for the CLI path.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fetch as signedFetchImpl } from "@hellocoop/httpsig";
import { SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK } from "jose";

/** Default issuer written by `neotoma auth keygen` (shared CLI + MCP proxy). */
export const DEFAULT_AAUTH_ISSUER = "https://neotoma.cursor.local";

/** Default `sub` for software keys: Cursor-oriented, still valid for CLI HTTP. */
export function defaultAauthSoftwareSubject(): string {
  return `cursor-agent@${os.hostname() || "localhost"}`;
}

export const AAUTH_CONFIG_DIR = path.join(os.homedir(), ".neotoma", "aauth");
export const AAUTH_PRIVATE_JWK_PATH = path.join(AAUTH_CONFIG_DIR, "private.jwk");
export const AAUTH_PUBLIC_JWK_PATH = path.join(AAUTH_CONFIG_DIR, "public.jwk");
export const AAUTH_CONFIG_PATH = path.join(AAUTH_CONFIG_DIR, "config.json");

export type SupportedAlg = "ES256" | "EdDSA";

export interface SignerFileConfig {
  /** AAuth subject — self-reported identity (e.g. `cursor-agent@myhost.local`). */
  sub: string;
  /** AAuth issuer — the authority that attests to this key. */
  iss: string;
  /** Optional `kid`; falls back to the one embedded in the JWK. */
  kid?: string;
  /** Agent-token JWT lifetime (default 300s). */
  token_ttl_sec?: number;
}

export interface LoadedSignerConfig {
  privateJwk: Record<string, unknown>;
  sub: string;
  iss: string;
  kid?: string;
  tokenTtlSec: number;
}

export class CliSignerConfigError extends Error {
  readonly code = "cli_signer_misconfigured" as const;
}

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(AAUTH_CONFIG_DIR, { recursive: true, mode: 0o700 });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a fresh AAuth keypair and persist it under {@link AAUTH_CONFIG_DIR}.
 * Refuses to overwrite an existing keypair unless `force` is set so an
 * accidental `neotoma auth keygen` does not silently invalidate an
 * already-trusted public key.
 */
export async function generateAndStoreKeypair(options?: {
  alg?: SupportedAlg;
  sub?: string;
  iss?: string;
  force?: boolean;
}): Promise<{
  alg: SupportedAlg;
  publicJwk: Record<string, unknown>;
  thumbprint: string;
  privateJwkPath: string;
  publicJwkPath: string;
  configPath: string;
  config: SignerFileConfig;
}> {
  const alg = options?.alg ?? "ES256";
  const sub = options?.sub ?? defaultAauthSoftwareSubject();
  const iss = options?.iss ?? DEFAULT_AAUTH_ISSUER;
  await ensureConfigDir();

  if (!options?.force && (await fileExists(AAUTH_PRIVATE_JWK_PATH))) {
    throw new CliSignerConfigError(
      `Refusing to overwrite existing keypair at ${AAUTH_PRIVATE_JWK_PATH}. ` +
        `Pass --force to rotate, or move the old key aside first.`
    );
  }

  const { privateKey, publicKey } = await generateKeyPair(alg, {
    extractable: true,
  });
  const privateJwk = (await exportJWK(privateKey)) as Record<string, unknown>;
  const publicJwk = (await exportJWK(publicKey)) as Record<string, unknown>;
  const thumbprint = await calculateJwkThumbprint(
    publicJwk as Parameters<typeof calculateJwkThumbprint>[0]
  );
  privateJwk.alg = alg;
  publicJwk.alg = alg;
  privateJwk.kid = thumbprint;
  publicJwk.kid = thumbprint;

  await fs.writeFile(AAUTH_PRIVATE_JWK_PATH, JSON.stringify(privateJwk, null, 2), { mode: 0o600 });
  await fs.writeFile(AAUTH_PUBLIC_JWK_PATH, JSON.stringify(publicJwk, null, 2), { mode: 0o644 });
  const config: SignerFileConfig = { sub, iss, kid: thumbprint, token_ttl_sec: 300 };
  await fs.writeFile(AAUTH_CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });

  return {
    alg,
    publicJwk,
    thumbprint,
    privateJwkPath: AAUTH_PRIVATE_JWK_PATH,
    publicJwkPath: AAUTH_PUBLIC_JWK_PATH,
    configPath: AAUTH_CONFIG_PATH,
    config,
  };
}

/**
 * Load the CLI signer configuration from disk. Returns `null` when no
 * keypair is configured — callers should treat a null return as
 * "signing disabled" and fall back to unsigned requests. Throws
 * {@link CliSignerConfigError} when a keypair is present but the
 * configuration is corrupt (e.g. malformed JSON).
 */
export async function loadCliSignerConfig(): Promise<LoadedSignerConfig | null> {
  if (!(await fileExists(AAUTH_PRIVATE_JWK_PATH))) {
    return null;
  }
  let privateJwk: Record<string, unknown>;
  try {
    const raw = await fs.readFile(AAUTH_PRIVATE_JWK_PATH, "utf-8");
    privateJwk = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new CliSignerConfigError(
      `Failed to read AAuth private key at ${AAUTH_PRIVATE_JWK_PATH}: ${(err as Error).message}`
    );
  }

  let cfg: SignerFileConfig = { sub: "", iss: "" };
  if (await fileExists(AAUTH_CONFIG_PATH)) {
    try {
      const raw = await fs.readFile(AAUTH_CONFIG_PATH, "utf-8");
      cfg = { ...cfg, ...(JSON.parse(raw) as SignerFileConfig) };
    } catch (err) {
      throw new CliSignerConfigError(
        `Failed to parse AAuth config at ${AAUTH_CONFIG_PATH}: ${(err as Error).message}`
      );
    }
  }

  const sub =
    process.env.NEOTOMA_AAUTH_SUB ||
    process.env.NEOTOMA_CLI_AAUTH_SUB ||
    cfg.sub ||
    defaultAauthSoftwareSubject();
  const iss =
    process.env.NEOTOMA_AAUTH_ISS ||
    process.env.NEOTOMA_CLI_AAUTH_ISS ||
    cfg.iss ||
    DEFAULT_AAUTH_ISSUER;
  const kid =
    process.env.NEOTOMA_AAUTH_KID ||
    process.env.NEOTOMA_CLI_AAUTH_KID ||
    cfg.kid ||
    (typeof privateJwk.kid === "string" ? (privateJwk.kid as string) : undefined);
  const ttl = Number.parseInt(
    process.env.NEOTOMA_AAUTH_TOKEN_TTL_SEC ??
      process.env.NEOTOMA_CLI_AAUTH_TOKEN_TTL_SEC ??
      String(cfg.token_ttl_sec ?? 300),
    10
  );

  return {
    privateJwk,
    sub,
    iss,
    kid,
    tokenTtlSec: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
  };
}

function resolveAlg(jwk: Record<string, unknown>): SupportedAlg {
  if (typeof jwk.alg === "string") {
    if (jwk.alg === "ES256") return "ES256";
    if (jwk.alg === "EdDSA") return "EdDSA";
  }
  if (jwk.kty === "EC" && jwk.crv === "P-256") return "ES256";
  if (jwk.kty === "OKP" && jwk.crv === "Ed25519") return "EdDSA";
  throw new CliSignerConfigError(
    `Unsupported JWK for AAuth signing: kty=${String(jwk.kty)} crv=${String(jwk.crv)} alg=${String(
      jwk.alg
    )}`
  );
}

function publicPartOf(jwk: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...jwk };
  for (const field of ["d", "p", "q", "dp", "dq", "qi"] as const) {
    delete copy[field];
  }
  return copy;
}

/** Shape of a single entry in the `https://neotoma.io/external_actors` JWT claim. */
export interface ExternalActorClaim {
  provider: "github";
  id: number;
  login: string;
  linked_at: string;
}

/** Build and sign an `aa-agent+jwt` agent token with the configured key. */
export async function mintCliAgentTokenJwt(
  config: LoadedSignerConfig,
  options?: {
    /** When provided, embedded as `https://neotoma.io/external_actors` custom claim. */
    externalActors?: ExternalActorClaim[];
  }
): Promise<string> {
  const alg = resolveAlg(config.privateJwk);
  const key = await importJWK(config.privateJwk as Parameters<typeof importJWK>[0], alg);
  const publicJwk = publicPartOf(config.privateJwk);
  const jkt = await calculateJwkThumbprint(
    publicJwk as Parameters<typeof calculateJwkThumbprint>[0]
  );
  const ttl = Math.max(30, config.tokenTtlSec ?? 300);

  const customClaims: Record<string, unknown> = {
    jkt,
    cnf: { jwk: publicJwk as import("jose").JWK },
  };
  if (options?.externalActors?.length) {
    customClaims["https://neotoma.io/external_actors"] = options.externalActors;
  }

  // RFC 9449 / AAuth: bind the signing key in the agent JWT via `cnf.jwk`
  // (httpsig verifies this matches the message-signing key material).
  const builder = new SignJWT(customClaims)
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

export interface CliSignedFetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  configOverride?: LoadedSignerConfig;
}

const AAUTH_COMPONENTS_WITH_BODY = [
  "@method",
  "@authority",
  "@path",
  "content-type",
  "content-digest",
  "signature-key",
] as const;
const AAUTH_COMPONENTS_WITHOUT_BODY = ["@method", "@authority", "@path", "signature-key"] as const;

/**
 * Signed fetch for CLI -> Neotoma API calls. Mirrors the agent-site
 * signed fetch but with CLI-sourced configuration. Returns an unsigned
 * `fetch` response when no keypair is configured so callers can use this
 * unconditionally (see `createApiClient`).
 */
export async function cliSignedFetch(
  url: string,
  options: CliSignedFetchOptions
): Promise<Response> {
  const config = options.configOverride ?? (await loadCliSignerConfig());
  if (!config) {
    return fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: options.signal,
    });
  }
  resolveAlg(config.privateJwk);
  const jwt = await mintCliAgentTokenJwt(config);

  const response = (await signedFetchImpl(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: options.signal,
    signingKey: config.privateJwk as unknown as JsonWebKey,
    signatureKey: { type: "jwt", jwt },
    label: "aasig",
    components: options.body ? [...AAUTH_COMPONENTS_WITH_BODY] : [...AAUTH_COMPONENTS_WITHOUT_BODY],
  })) as Response;

  if (!response || typeof (response as Response).status !== "number") {
    throw new CliSignerConfigError(`cliSignedFetch returned unexpected shape for ${url}.`);
  }
  return response;
}

/**
 * Build a debugging curl that replays a signed POST against the given
 * URL. Does not execute the request — just prints the command.
 */
export async function buildSignedCurlExample(
  url: string,
  bodyJson: string
): Promise<{
  curl: string;
  headers: Record<string, string>;
}> {
  const config = await loadCliSignerConfig();
  if (!config) {
    throw new CliSignerConfigError(
      `No AAuth keypair found at ${AAUTH_PRIVATE_JWK_PATH}. Run \`neotoma auth keygen\` first.`
    );
  }
  // Execute a real sign and capture headers via a mock fetch (the hellocoop
  // library does the header computation for us). We pass a dryRun-style
  // mock by intercepting fetch via signal abort after headers land.
  // Simpler: just mint the JWT and let the user know the full signature
  // flow requires a live request.
  const jwt = await mintCliAgentTokenJwt(config);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "signature-key": jwt,
    "x-aauth-debug": "cli-example",
  };
  const headerArgs = Object.entries(headers)
    .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`)
    .join(" ");
  const curl = `curl -X POST ${JSON.stringify(url)} ${headerArgs} -d ${JSON.stringify(bodyJson)}`;
  return { curl, headers };
}

/**
 * Summarise the currently configured signer for `neotoma auth session`
 * output. Returns `null` when no keypair is configured.
 */
export async function describeConfiguredSigner(): Promise<
  | {
      configured: true;
      alg: SupportedAlg;
      sub: string;
      iss: string;
      thumbprint: string;
      private_jwk_path: string;
      public_jwk_path: string;
    }
  | { configured: false; reason: string }
> {
  try {
    const cfg = await loadCliSignerConfig();
    if (!cfg) {
      return {
        configured: false,
        reason: `No keypair at ${AAUTH_PRIVATE_JWK_PATH}`,
      };
    }
    const alg = resolveAlg(cfg.privateJwk);
    const publicJwk = publicPartOf(cfg.privateJwk);
    const thumbprint = await calculateJwkThumbprint(
      publicJwk as Parameters<typeof calculateJwkThumbprint>[0]
    );
    return {
      configured: true,
      alg,
      sub: cfg.sub,
      iss: cfg.iss,
      thumbprint,
      private_jwk_path: AAUTH_PRIVATE_JWK_PATH,
      public_jwk_path: AAUTH_PUBLIC_JWK_PATH,
    };
  } catch (err) {
    return {
      configured: false,
      reason: (err as Error).message,
    };
  }
}
