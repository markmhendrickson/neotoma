import createClient from "openapi-fetch";
import type { paths } from "./openapi_types.js";
import { getLocalTransportClient } from "./local_transport.js";

export interface ApiClientOptions {
  baseUrl?: string;
  token?: string;
  useOfflineFallback?: boolean;
  /**
   * When true, sign outbound requests with the CLI-side AAuth keypair at
   * `~/.neotoma/aauth/`. Silently falls back to unsigned `fetch` when no
   * keypair is configured so CLI callers that have not run
   * `neotoma auth keygen` are unaffected. Defaults to true in CLI
   * contexts and false in test / offline contexts.
   */
  signWithCliAAuth?: boolean;
  /**
   * When true with `signWithCliAAuth`, do not fall back to unsigned `fetch`
   * on missing/unusable keys or signing errors. Intended for unattended
   * paths (`issues sync` env-gated AAuth, `api --aauth`) where silent
   * anonymous requests would mask misconfiguration. Optional interactive
   * signing keeps the default silent fallback.
   */
  requireCliAAuth?: boolean;
  /**
   * Force the HTTP transport even when `NEOTOMA_FORCE_LOCAL_TRANSPORT=true`.
   * The in-process local transport never makes an HTTP request, so RFC 9421
   * request signing has nothing to sign — AAuth-attributed calls MUST go over
   * HTTP. Setting this also disables the offline→local fallback (which would
   * likewise bypass signing). Pairs with `signWithCliAAuth`.
   */
  forceHttpTransport?: boolean;
  /**
   * When an AAuth keypair is configured, the request signature is the only
   * credential sent: an environment or stored bearer passed as `token` is
   * withheld from HTTP requests. Set this to send the bearer as well. The CLI
   * sets it only from the explicit `--with-bearer` flag (never from an
   * environment variable); defaults to {@link isExplicitBearerRequested}.
   */
  allowBearerWithSignature?: boolean;
}

/**
 * Set by the CLI from the explicit `--with-bearer` flag on each command.
 * Module state rather than an environment variable on purpose: an inherited
 * variable is ambient, and the point of the rule is that only an explicit,
 * per-invocation request may add a bearer beside an AAuth signature.
 */
let explicitBearerRequested = false;

export function setExplicitBearerRequested(requested: boolean): void {
  explicitBearerRequested = requested;
}

export function isExplicitBearerRequested(): boolean {
  return explicitBearerRequested;
}

/**
 * Environment variables that turn CLI request signing off. Returns the
 * variable (as `NAME=value`) that does so, or null.
 */
export function cliAAuthDisabledByEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NEOTOMA_CLI_AAUTH_DISABLE === "1") return "NEOTOMA_CLI_AAUTH_DISABLE=1";
  if (env.NEOTOMA_CLI_AAUTH_ENABLE === "0") return "NEOTOMA_CLI_AAUTH_ENABLE=0";
  return null;
}

export class CliAAuthDisabledWithKeyError extends Error {
  constructor(variable: string) {
    super(
      `${variable} turns AAuth request signing off, but an AAuth keypair is configured ` +
        "(NEOTOMA_AAUTH_PRIVATE_JWK_PATH or ~/.neotoma/aauth/private.jwk). Refusing to send this " +
        `request without its signature. Unset ${variable} to sign with the configured key, or pass ` +
        "--with-bearer to authenticate this command with the bearer token instead."
    );
    this.name = "CliAAuthDisabledWithKeyError";
  }
}

function withoutAuthorization(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") continue;
    next[key] = value;
  }
  return next;
}

/**
 * Inputs to the CLI credential rule. Every CLI HTTP request — through
 * {@link createApiClient} or through {@link resolveCliRequestAuth} for a raw
 * `fetch` — is decided by {@link decideCliCredentials}, so no command can send
 * a different credential from the others.
 */
export interface CliCredentialInput {
  /** A CLI AAuth private key file is present (`hasCliAAuthKeypair`). */
  hasKeypair: boolean;
  /** `signWithCliAAuth` as the caller passed it: true / false, or undefined for automatic. */
  signWithCliAAuth: boolean | undefined;
  /** The variable that turns signing off ({@link cliAAuthDisabledByEnv}), or null. */
  disabledBy: string | null;
  /** NODE_ENV=test, where automatic signing is off. */
  testEnv: boolean;
  /** The explicit `--with-bearer` request, or the caller's `allowBearerWithSignature`. */
  allowBearerWithSignature: boolean;
}

export interface CliCredentialDecision {
  /** Sign the request with the CLI keypair (unsigned when no usable key is found). */
  sign: boolean;
  /** Attach `Authorization: Bearer <token>` when the caller has a token. */
  bearer: boolean;
}

/**
 * The CLI credential rule.
 *
 * - `signWithCliAAuth: false` (caller decided): unsigned, bearer as passed.
 * - Automatic, with a disable variable set: refuses with
 *   {@link CliAAuthDisabledWithKeyError} when a key is configured and no bearer
 *   was explicitly requested; otherwise unsigned, bearer as passed.
 * - Automatic under NODE_ENV=test: unsigned, bearer as passed.
 * - Otherwise signed. With a key configured the signature is the only
 *   credential unless a bearer was explicitly requested; with no key the
 *   bearer is sent as before.
 */
export function decideCliCredentials(input: CliCredentialInput): CliCredentialDecision {
  if (input.signWithCliAAuth === false) return { sign: false, bearer: true };
  if (input.signWithCliAAuth === undefined && input.disabledBy !== null) {
    if (input.hasKeypair && !input.allowBearerWithSignature) {
      throw new CliAAuthDisabledWithKeyError(input.disabledBy);
    }
    return { sign: false, bearer: true };
  }
  if (input.signWithCliAAuth === undefined && input.testEnv) return { sign: false, bearer: true };
  return { sign: true, bearer: !input.hasKeypair || input.allowBearerWithSignature };
}

interface CliCredentialPolicy {
  signWithCliAAuth: boolean | undefined;
  disabledBy: string | null;
  testEnv: boolean;
  allowBearerWithSignature: boolean;
  requireCliAAuth: boolean;
}

function cliCredentialPolicy(options: {
  signWithCliAAuth?: boolean;
  requireCliAAuth?: boolean;
  allowBearerWithSignature?: boolean;
}): CliCredentialPolicy {
  return {
    signWithCliAAuth: options.signWithCliAAuth,
    disabledBy: cliAAuthDisabledByEnv(),
    testEnv: process.env.NODE_ENV === "test",
    allowBearerWithSignature: options.allowBearerWithSignature ?? isExplicitBearerRequested(),
    requireCliAAuth: Boolean(options.requireCliAAuth),
  };
}

/** Whether the decision for this policy depends on a key being configured. */
function keypairMatters(policy: CliCredentialPolicy): boolean {
  if (policy.signWithCliAAuth === false) return false;
  if (policy.signWithCliAAuth === undefined && policy.disabledBy === null && policy.testEnv) {
    return false;
  }
  return true;
}

async function checkCliKeypair(): Promise<boolean> {
  const { hasCliAAuthKeypair } = await import("../cli/aauth_signer.js");
  return hasCliAAuthKeypair();
}

/**
 * Send a request signed with the CLI-side AAuth keypair. When signing fails
 * (no usable key) and signing is not required, the request goes out unsigned;
 * `stripBearer` removes any `Authorization` header on both paths. The
 * indirection keeps Node-only `fs`/`jose` imports out of the browser bundle
 * via a dynamic import.
 */
async function sendSigned(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: { requireCliAAuth: boolean; stripBearer: boolean }
): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const url = request ? request.url : typeof input === "string" ? input : input.toString();
  const { cliSignedFetch, loadCliSignerConfig } = await import("../cli/aauth_signer.js");
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  const sourceHeaders = new Headers(request?.headers);
  if (init?.headers) {
    const overrides = new Headers(init.headers);
    overrides.forEach((value, key) => {
      sourceHeaders.set(key, value);
    });
  }
  sourceHeaders.forEach((value, key) => {
    headers[key] = value;
  });
  let body = typeof init?.body === "string" ? init.body : undefined;
  if (body === undefined && request && method !== "GET" && method !== "HEAD") {
    body = await request.clone().text();
  }
  try {
    if (opts.requireCliAAuth) {
      const signerConfig = await loadCliSignerConfig();
      if (!signerConfig) {
        throw new Error(
          "AAuth signing is required but no usable CLI keypair was found. " +
            "Set NEOTOMA_AAUTH_PRIVATE_JWK_PATH to a valid private JWK, or run `neotoma auth keygen`."
        );
      }
    }
    return await cliSignedFetch(url, {
      method,
      headers: opts.stripBearer ? withoutAuthorization(headers) : headers,
      body,
      signal: init?.signal ?? undefined,
    });
  } catch (err) {
    if (opts.requireCliAAuth) throw err;
    // Never surface signing misconfiguration as a hard failure from the
    // API client — the caller should still reach the server and land
    // as `unverified_client` / `anonymous` tier.
    if (opts.stripBearer) {
      const unsigned = new Request(input, init);
      unsigned.headers.delete("authorization");
      return fetch(unsigned);
    }
    return fetch(input, init);
  }
}

/**
 * Build the `fetch` the API client uses. Each request is decided by
 * {@link decideCliCredentials}: refused, sent unsigned, or signed with the
 * `Authorization` header kept or removed. When the decision cannot depend on a
 * key (signing off by the caller or by NODE_ENV=test) the global `fetch` is
 * returned unchanged. The key check runs once per client.
 */
function buildCliFetch(policy: CliCredentialPolicy): typeof fetch {
  if (!keypairMatters(policy)) return fetch;
  let keypair: Promise<boolean> | undefined;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    keypair ??= checkCliKeypair();
    const decision = decideCliCredentials({ ...policy, hasKeypair: await keypair });
    if (!decision.sign) return fetch(input, init);
    return sendSigned(input, init, {
      requireCliAAuth: policy.requireCliAAuth,
      stripBearer: !decision.bearer,
    });
  }) as typeof fetch;
}

export interface CliRequestAuthOptions {
  /** The bearer the CLI resolved (`getCliToken`), if any. */
  token?: string;
  signWithCliAAuth?: boolean;
  requireCliAAuth?: boolean;
  allowBearerWithSignature?: boolean;
}

export interface CliRequestAuth {
  /** Headers to add to the request: `Authorization: Bearer <token>`, or none. */
  headers: Record<string, string>;
  /** The `fetch` to send it with: signed when the request is signed, else the global `fetch`. */
  fetch: typeof fetch;
  /** The decision these were built from. */
  decision: CliCredentialDecision;
}

/**
 * Credentials for a CLI request that does not go through
 * {@link createApiClient} (a raw path, a stream, a probe of `/me`). Applies the
 * same rule as the API client: with a key configured the bearer is attached
 * only on an explicit `--with-bearer`, and a disable variable with a key
 * configured throws {@link CliAAuthDisabledWithKeyError} before anything is
 * sent. Send with `auth.fetch(url, { ...init, headers: { ...h, ...auth.headers } })`.
 */
export async function resolveCliRequestAuth(
  options: CliRequestAuthOptions = {}
): Promise<CliRequestAuth> {
  const policy = cliCredentialPolicy(options);
  const hasKeypair = keypairMatters(policy) ? await checkCliKeypair() : false;
  const decision = decideCliCredentials({ ...policy, hasKeypair });
  const headers: Record<string, string> =
    options.token && decision.bearer ? { Authorization: `Bearer ${options.token}` } : {};
  const fetchImpl: typeof fetch = decision.sign
    ? ((async (input: RequestInfo | URL, init?: RequestInit) =>
        sendSigned(input, init, {
          requireCliAAuth: policy.requireCliAAuth,
          stripBearer: !decision.bearer,
        })) as typeof fetch)
    : fetch;
  return { headers, fetch: fetchImpl, decision };
}

export type NeotomaApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: ApiClientOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const fetchImpl = buildCliFetch(cliCredentialPolicy(options));

  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    headers,
    fetch: fetchImpl,
  });

  const defaultFallback =
    process.env.NODE_ENV === "test"
      ? false
      : process.env.NEOTOMA_ENABLE_OFFLINE_FALLBACK === "true" &&
        process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK !== "true";
  const shouldFallback = options.forceHttpTransport
    ? false
    : (options.useOfflineFallback ?? defaultFallback);
  const forceLocal =
    !options.forceHttpTransport && process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT === "true";

  const canFallbackForPath = (path: string): boolean => path !== "/health";
  const isNetworkError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    const causeCode = (err.cause as { code?: string } | undefined)?.code;
    const message = err.message ?? "";
    return (
      message === "fetch failed" ||
      message.includes("ECONNREFUSED") ||
      message.includes("ECONNRESET") ||
      message.includes("timeout") ||
      causeCode === "ECONNREFUSED" ||
      causeCode === "ECONNRESET" ||
      causeCode === "ETIMEDOUT"
    );
  };

  const wrapMethod = <TMethod extends "GET" | "POST" | "PUT" | "DELETE">(method: TMethod) => {
    const original = client[method].bind(client) as (
      path: string,
      ...args: unknown[]
    ) => Promise<unknown>;
    return (async (path: string, ...args: unknown[]) => {
      if (forceLocal && canFallbackForPath(path)) {
        const localClient = await getLocalTransportClient({
          token: options.token,
          baseUrl: options.baseUrl,
        });
        const localMethod = localClient[method].bind(localClient) as (
          path: string,
          ...args: unknown[]
        ) => Promise<unknown>;
        return localMethod(path, ...args);
      }
      try {
        return await original(path, ...args);
      } catch (err) {
        if (!shouldFallback || !canFallbackForPath(path) || !isNetworkError(err)) {
          throw err;
        }
        const localClient = await getLocalTransportClient({
          token: options.token,
          baseUrl: options.baseUrl,
        });
        const localMethod = localClient[method].bind(localClient) as (
          path: string,
          ...args: unknown[]
        ) => Promise<unknown>;
        return localMethod(path, ...args);
      }
    }) as (typeof client)[TMethod];
  };

  return {
    ...client,
    GET: wrapMethod("GET"),
    POST: wrapMethod("POST"),
    PUT: wrapMethod("PUT"),
    DELETE: wrapMethod("DELETE"),
  };
}
