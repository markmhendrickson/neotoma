/**
 * Public AAuth client SDK for external Node agents and observers.
 *
 * Closes #266 — provides a stable entrypoint so third-party Node processes
 * (e.g. a Mac-side CLI observer wiring its JSONL feed into Neotoma) can
 * sign HTTP requests per RFC 9421 without reaching into `src/cli/`
 * internals.
 *
 * The signing primitive (`signedFetch`) is a thin wrapper over the same
 * `@hellocoop/httpsig` flow the Neotoma CLI uses for its own outbound
 * requests. Two key-resolution paths are supported:
 *
 *   1. **Default config** — same as the CLI: read `~/.neotoma/aauth/private.jwk`
 *      and `~/.neotoma/aauth/config.json`. Convenient for one-machine setups
 *      where the observer shares an identity with the operator's CLI.
 *
 *   2. **Explicit key + claims** — pass a `keyPath` or `privateJwk` plus
 *      `sub`/`iss`. Right for distributing observers across machines without
 *      letting them inherit ambient operator credentials.
 *
 * Provisioning a key on the server side is a separate step — see
 * `neotoma auth keygen --register` (issue #265).
 *
 * Re-exports of stable types/functions live at the bottom of this file
 * rather than being inlined so callers can `import { signedFetch } from "neotoma/aauth"`
 * without leaking internal CLI symbols.
 */

import { readFile } from "node:fs/promises";

import {
  cliSignedFetch,
  loadCliSignerConfig,
  type CliSignedFetchOptions,
  type LoadedSignerConfig,
  type SupportedAlg,
} from "../cli/aauth_signer.js";

/** Options accepted by {@link signedFetch}. */
export interface SignedFetchOptions {
  /** HTTP method (`GET`, `POST`, …). */
  method: string;
  /** Optional headers; `content-type` is honoured when a body is present. */
  headers?: Record<string, string>;
  /** Stringified request body (callers stringify JSON themselves). */
  body?: string;
  /** Abort signal forwarded to the underlying `fetch`. */
  signal?: AbortSignal;
  /**
   * Pre-loaded signer config. Mutually exclusive with `keyPath`/`privateJwk`.
   * Use this when the caller already produced a {@link LoadedSignerConfig}
   * via {@link loadSignerConfig}.
   */
  signerConfig?: LoadedSignerConfig;
  /**
   * Path to a JWK on disk (private). When set, also supply `sub` and `iss`
   * (the agent-token JWT claims) unless the caller is comfortable with
   * `loadCliSignerConfig`'s defaults.
   */
  keyPath?: string;
  /** Inline private JWK. Mutually exclusive with `keyPath`. */
  privateJwk?: Record<string, unknown>;
  /** AAuth `sub` claim. Required when supplying an inline key/path. */
  sub?: string;
  /** AAuth `iss` claim. Defaults to `https://neotoma.cursor.local`. */
  iss?: string;
  /** Optional explicit `kid`; defaults to the JWK's own `kid`. */
  kid?: string;
  /** Agent-token JWT lifetime in seconds (default 300). */
  tokenTtlSec?: number;
}

/**
 * Sign an HTTP request per RFC 9421 with an AAuth agent token and dispatch
 * it. Returns the standard `Response` object.
 *
 * Resolution order for the signing key:
 *
 *   1. `signerConfig` — caller-supplied {@link LoadedSignerConfig}.
 *   2. `privateJwk` (inline) or `keyPath` (on-disk JWK file).
 *   3. Default CLI config at `~/.neotoma/aauth/`.
 *
 * When **no** key is configured the SDK refuses to silently fall back to
 * an unsigned request — that would defeat the purpose of using this
 * function. Callers who want an unsigned-fallback behaviour should use
 * Neotoma's CLI `cliSignedFetch` (which does fall back), or guard with
 * {@link loadSignerConfig} themselves.
 */
export async function signedFetch(url: string, options: SignedFetchOptions): Promise<Response> {
  const config = await resolveSignerConfig(options);
  if (!config) {
    throw new Error(
      `signedFetch: no AAuth signing key found. Configure one with \`neotoma auth keygen --register\`, ` +
        `or pass {keyPath, sub, iss} / {privateJwk, sub, iss} explicitly.`
    );
  }
  const fetchOptions: CliSignedFetchOptions = {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: options.signal,
    configOverride: config,
  };
  return cliSignedFetch(url, fetchOptions);
}

/**
 * Load a {@link LoadedSignerConfig} without dispatching a request. Useful
 * for callers that want to mint many signed requests from the same key
 * (avoids re-reading disk on every call) or that want to inspect the
 * resolved `sub`/`iss`/`thumbprint` before signing.
 *
 * When `keyPath` / `privateJwk` are omitted, falls back to the CLI's
 * `~/.neotoma/aauth/` keypair. Returns `null` if no key is configured.
 */
export async function loadSignerConfig(
  options: {
    keyPath?: string;
    privateJwk?: Record<string, unknown>;
    sub?: string;
    iss?: string;
    kid?: string;
    tokenTtlSec?: number;
  } = {}
): Promise<LoadedSignerConfig | null> {
  return resolveSignerConfig(options);
}

async function resolveSignerConfig(options: {
  signerConfig?: LoadedSignerConfig;
  keyPath?: string;
  privateJwk?: Record<string, unknown>;
  sub?: string;
  iss?: string;
  kid?: string;
  tokenTtlSec?: number;
}): Promise<LoadedSignerConfig | null> {
  if (options.signerConfig) return options.signerConfig;
  if (options.privateJwk && options.keyPath) {
    throw new Error("signedFetch: pass either `privateJwk` or `keyPath`, not both.");
  }
  let privateJwk: Record<string, unknown> | undefined = options.privateJwk;
  if (!privateJwk && options.keyPath) {
    const raw = await readFile(options.keyPath, "utf-8");
    privateJwk = JSON.parse(raw) as Record<string, unknown>;
  }
  if (privateJwk) {
    const sub = options.sub;
    const iss = options.iss ?? "https://neotoma.cursor.local";
    if (!sub) {
      throw new Error(
        "signedFetch: `sub` is required when supplying an explicit key (keyPath / privateJwk)."
      );
    }
    return {
      privateJwk,
      sub,
      iss,
      kid:
        options.kid ??
        (typeof privateJwk.kid === "string" ? (privateJwk.kid as string) : undefined),
      tokenTtlSec: options.tokenTtlSec ?? 300,
    };
  }
  return loadCliSignerConfig();
}

export type { LoadedSignerConfig, SupportedAlg };
