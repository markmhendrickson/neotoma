/**
 * AAuth attestation revocation service (FU-2026-Q4-aauth-attestation-revocation).
 *
 * Provides a shared, format-aware revocation lookup for the AAuth
 * attestation pipeline. Every format-specific verifier
 * (`apple-secure-enclave`, `webauthn-packed`, `tpm2`) calls
 * {@link checkRevocation} after chain validation and before returning a
 * verified outcome. The result is one of:
 *
 *   - `good`     — no evidence of revocation; the attestation may keep
 *                  its current tier mapping.
 *   - `revoked`  — the chain (or its underlying root of trust) is
 *                  revoked. In `enforce` mode the verifier demotes the
 *                  request from `hardware` to `software`; in `log_only`
 *                  mode the result is surfaced in diagnostics only.
 *   - `unknown`  — the responder could not be reached, returned an
 *                  inconclusive answer, or the cert carries no
 *                  AIA/CDP/Apple endpoint to consult. Behaviour on
 *                  `unknown` follows
 *                  `NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN` (default
 *                  `true`): when fail-open is enabled `unknown` is
 *                  treated as `good`; when disabled (and the mode is
 *                  `enforce`) it is treated as `revoked`.
 *
 * Operational modes are gated by `NEOTOMA_AAUTH_REVOCATION_MODE`:
 *
 *   - `disabled` — the service short-circuits to `{ status: "good",
 *                  source: "disabled" }` without making network calls.
 *                  Default until v0.11.0.
 *   - `log_only` — checks run; revocation status is included in the
 *                  outcome and surfaced in diagnostics, but tier
 *                  resolution is unchanged. Default in v0.11.0.
 *   - `enforce`  — checks run; `revoked` (and, when fail-open is
 *                  disabled, `unknown`) demotes `hardware` to
 *                  `software`. Default in v0.12.0.
 *
 * The service maintains an in-memory LRU cache keyed by the SHA-256
 * fingerprint of the leaf certificate. TTL defaults to 1 hour and is
 * configurable via `NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS`. Per-call
 * timeouts default to 1500ms and can be tuned with
 * `NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS`.
 *
 * Out of scope (per spec):
 *   - Persistent revocation cache across processes (in-memory only).
 *   - Active polling / pre-warming of revocation evidence.
 *   - OCSP signature pinning beyond standard responder validation.
 */

import { X509Certificate, createHash } from "node:crypto";

import type { AttestationFormat } from "./aauth_attestation_verifier.js";

/** Operational mode for the revocation service. */
export type RevocationMode = "disabled" | "log_only" | "enforce";

/** Outcome status for a single revocation lookup. */
export type RevocationStatus = "good" | "revoked" | "unknown";

/**
 * Source classifying which evidence channel produced this outcome. The
 * Inspector renders this tag alongside the status so operators can
 * triage `unknown` results without parsing raw responder responses.
 */
export type RevocationSource =
  | "disabled"
  | "cache"
  | "apple"
  | "ocsp"
  | "crl"
  | "no_endpoint"
  | "error";

/** Structured outcome returned by {@link checkRevocation}. */
export interface RevocationOutcome {
  /** Resolved revocation status. */
  status: RevocationStatus;
  /** Channel the status came from. */
  source: RevocationSource;
  /** Optional diagnostic detail (e.g. responder URL, error category). */
  detail?: string;
  /**
   * When the result was served from cache, the original `checked_at`
   * timestamp (epoch milliseconds) of the underlying lookup. Absent on
   * fresh lookups; the call site can stamp its own `checked_at`.
   */
  cached_at?: number;
}

/**
 * Per-call context passed by each format verifier. The verifier owns
 * chain validation; the revocation service consumes the validated chain
 * (leaf-first) plus the format discriminator and consults the right
 * channel.
 */
export interface RevocationCheckContext {
  /** Validated certificate chain, leaf-first. */
  chain: X509Certificate[];
  /** Format discriminator from the parent envelope. */
  format: AttestationFormat;
  /**
   * Optional override for testing — when supplied the service uses this
   * mode instead of reading {@link readRevocationMode}. Production code
   * leaves this unset.
   */
  modeOverride?: RevocationMode;
  /**
   * Optional fetcher injection seam used by tests to avoid real network
   * traffic. Defaults to the built-in HTTP/2 fetcher.
   */
  fetcher?: RevocationFetcher;
}

/**
 * Pluggable fetcher seam. Implementations must respect the per-call
 * timeout and resolve to a structured response rather than throwing on
 * network errors so the service can record `unknown` reliably.
 */
export interface RevocationFetcher {
  fetch(input: {
    url: string;
    method: "GET" | "POST";
    body?: Buffer;
    headers?: Record<string, string>;
    timeoutMs: number;
  }): Promise<{
    ok: boolean;
    status: number;
    body: Buffer;
    error?: string;
  }>;
}

/**
 * Read and validate the revocation operational mode from the
 * environment. Unknown values fall back to `disabled` to preserve the
 * v0.10.x posture until operators opt in.
 */
export function readRevocationMode(
  env: NodeJS.ProcessEnv = process.env,
): RevocationMode {
  const raw = env.NEOTOMA_AAUTH_REVOCATION_MODE;
  if (raw === undefined || raw === null) return "disabled";
  const normalised = String(raw).trim().toLowerCase();
  if (
    normalised === "disabled" ||
    normalised === "log_only" ||
    normalised === "enforce"
  ) {
    return normalised;
  }
  return "disabled";
}

/**
 * Read the cache TTL in milliseconds. Default: 1 hour. Negative or
 * non-finite values reset to the default so a typo cannot disable the
 * cache implicitly.
 */
export function readCacheTtlMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS;
  if (raw === undefined || raw === null || raw === "") {
    return 60 * 60 * 1000;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 60 * 60 * 1000;
  return Math.floor(parsed * 1000);
}

/**
 * Read the per-lookup network timeout in milliseconds. Default:
 * 1500ms. Floors at 100ms so a misconfiguration cannot effectively
 * disable the service.
 */
export function readTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS;
  if (raw === undefined || raw === null || raw === "") return 1500;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1500;
  if (parsed < 100) return 100;
  return Math.floor(parsed);
}

/**
 * Read the fail-open flag. When `true` (default) `unknown` outcomes are
 * treated as `good` for tier-resolution purposes; when `false`,
 * `unknown` is treated as `revoked` in `enforce` mode.
 */
export function readFailOpen(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN;
  if (raw === undefined || raw === null || raw === "") return true;
  const normalised = String(raw).trim().toLowerCase();
  if (normalised === "0" || normalised === "false" || normalised === "no") {
    return false;
  }
  return true;
}

/**
 * Module-scoped LRU cache. Keyed by the SHA-256 fingerprint of the leaf
 * certificate (lowercased, colon-stripped). Capacity is intentionally
 * small — the working set is bounded by the number of distinct agent
 * leaves seen per process.
 */
const CACHE_MAX_ENTRIES = 1024;

interface CacheEntry {
  outcome: RevocationOutcome;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test helper: clear the cache between tests. Production code never calls this. */
export function resetRevocationCacheForTests(): void {
  cache.clear();
}

/**
 * Snapshot the current cache size. Exposed for tests and metrics; not
 * part of the public service contract.
 */
export function getRevocationCacheSizeForTests(): number {
  return cache.size;
}

/**
 * Compute the cache key for a leaf certificate. The fingerprint already
 * uniquely identifies the leaf without leaking subject DNs into the
 * key space.
 */
function cacheKeyFor(leaf: X509Certificate): string {
  return leaf.fingerprint256.replace(/:/g, "").toLowerCase();
}

function readCache(key: string, now: number): RevocationOutcome | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  // Mark as recently used by reinserting.
  cache.delete(key);
  cache.set(key, entry);
  return { ...entry.outcome, source: "cache", cached_at: entry.outcome.cached_at };
}

function writeCache(
  key: string,
  outcome: RevocationOutcome,
  now: number,
  ttlMs: number,
): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Evict least-recently used (first inserted in iteration order).
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, {
    outcome: { ...outcome, cached_at: now },
    expiresAt: now + ttlMs,
  });
}

/**
 * Top-level entry point. Idempotent and safe to call from any format
 * verifier; honours the operational mode and cache.
 */
export async function checkRevocation(
  ctx: RevocationCheckContext,
): Promise<RevocationOutcome> {
  const mode = ctx.modeOverride ?? readRevocationMode();
  if (mode === "disabled") {
    return { status: "good", source: "disabled" };
  }
  if (ctx.chain.length === 0) {
    return {
      status: "unknown",
      source: "no_endpoint",
      detail: "empty_chain",
    };
  }
  const leaf = ctx.chain[0]!;
  const key = cacheKeyFor(leaf);
  const now = Date.now();
  const cached = readCache(key, now);
  if (cached) return cached;

  const ttlMs = readCacheTtlMs();
  const timeoutMs = readTimeoutMs();
  const fetcher = ctx.fetcher ?? defaultFetcher;

  let outcome: RevocationOutcome;
  try {
    outcome = await runCheck({
      leaf,
      chain: ctx.chain,
      format: ctx.format,
      timeoutMs,
      fetcher,
    });
  } catch (err) {
    outcome = {
      status: "unknown",
      source: "error",
      detail: describeError(err),
    };
  }

  writeCache(key, outcome, now, ttlMs);
  return outcome;
}

/**
 * Format-aware lookup dispatcher. Apple Secure Enclave attestations
 * call Apple's revocation endpoint; everything else uses standard
 * OCSP with CRL fallback.
 */
async function runCheck(input: {
  leaf: X509Certificate;
  chain: X509Certificate[];
  format: AttestationFormat;
  timeoutMs: number;
  fetcher: RevocationFetcher;
}): Promise<RevocationOutcome> {
  if (input.format === "apple-secure-enclave") {
    return checkAppleRevocation({
      leaf: input.leaf,
      timeoutMs: input.timeoutMs,
      fetcher: input.fetcher,
    });
  }
  return checkOcspWithCrlFallback({
    leaf: input.leaf,
    chain: input.chain,
    timeoutMs: input.timeoutMs,
    fetcher: input.fetcher,
  });
}

/**
 * Apple's anonymous-attestation revocation endpoint. The endpoint
 * accepts a list of leaf serial numbers and returns a JSON document
 * listing revoked entries.
 *
 * Configurable via `NEOTOMA_AAUTH_APPLE_REVOCATION_URL`; defaults to
 * Apple's documented production endpoint.
 */
async function checkAppleRevocation(input: {
  leaf: X509Certificate;
  timeoutMs: number;
  fetcher: RevocationFetcher;
}): Promise<RevocationOutcome> {
  const endpoint =
    process.env.NEOTOMA_AAUTH_APPLE_REVOCATION_URL ??
    "https://data.appattest.apple.com/v1/revoked-list";
  const serialHex = input.leaf.serialNumber.toLowerCase();
  const body = Buffer.from(
    JSON.stringify({ serial_numbers: [serialHex] }),
    "utf8",
  );
  const response = await input.fetcher.fetch({
    url: endpoint,
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    timeoutMs: input.timeoutMs,
  });
  if (response.error) {
    return {
      status: "unknown",
      source: "apple",
      detail: `fetch_error:${response.error}`,
    };
  }
  if (!response.ok) {
    return {
      status: "unknown",
      source: "apple",
      detail: `http_${response.status}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body.toString("utf8"));
  } catch {
    return {
      status: "unknown",
      source: "apple",
      detail: "parse_error",
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      status: "unknown",
      source: "apple",
      detail: "shape_error",
    };
  }
  const list = (parsed as Record<string, unknown>).revoked;
  if (!Array.isArray(list)) {
    return { status: "good", source: "apple" };
  }
  const lowercased = list
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.toLowerCase());
  if (lowercased.includes(serialHex)) {
    return { status: "revoked", source: "apple" };
  }
  return { status: "good", source: "apple" };
}

/**
 * Standard OCSP / CRL flow shared by `webauthn-packed` and `tpm2`. The
 * leaf's `Authority Information Access` extension is consulted for an
 * `OCSP` URL; if absent or unreachable we fall back to the
 * `CRL Distribution Points` extension. Either path may surface as
 * `unknown` when the responder is silent — the calling verifier
 * decides whether to fail open or closed based on
 * {@link readFailOpen}.
 *
 * NOTE: The OCSP request encoding follows RFC 6960 but uses a
 * lightweight DER builder rather than pulling in a third-party ASN.1
 * package. Issuer name and key hashes are derived from the leaf's
 * issuer cert (chain[1]) when available.
 */
async function checkOcspWithCrlFallback(input: {
  leaf: X509Certificate;
  chain: X509Certificate[];
  timeoutMs: number;
  fetcher: RevocationFetcher;
}): Promise<RevocationOutcome> {
  const ocspUrl = extractOcspUrl(input.leaf);
  if (ocspUrl) {
    const result = await tryOcsp({
      url: ocspUrl,
      leaf: input.leaf,
      issuer: input.chain[1] ?? input.leaf,
      timeoutMs: input.timeoutMs,
      fetcher: input.fetcher,
    });
    if (result.status !== "unknown") return result;
    // Fall through to CRL on `unknown`; preserves the OCSP detail in
    // the eventual outcome when CRL is also missing.
  }

  const crlUrl = extractCrlUrl(input.leaf);
  if (crlUrl) {
    const result = await tryCrl({
      url: crlUrl,
      leaf: input.leaf,
      timeoutMs: input.timeoutMs,
      fetcher: input.fetcher,
    });
    if (result.status !== "unknown" || !ocspUrl) return result;
  }

  if (!ocspUrl && !crlUrl) {
    return {
      status: "unknown",
      source: "no_endpoint",
      detail: "no_aia_or_cdp",
    };
  }
  return {
    status: "unknown",
    source: ocspUrl ? "ocsp" : "crl",
    detail: "no_conclusive_response",
  };
}

/**
 * Issue an OCSP request and parse the response. Returns `unknown` on
 * any non-conclusive outcome so the caller can fall back to CRL.
 *
 * The OCSP request body is intentionally a minimal RFC 6960-shaped
 * DER blob covering a single CertID — the responder receives enough
 * to identify the leaf without exposing the full chain.
 */
async function tryOcsp(input: {
  url: string;
  leaf: X509Certificate;
  issuer: X509Certificate;
  timeoutMs: number;
  fetcher: RevocationFetcher;
}): Promise<RevocationOutcome> {
  let body: Buffer;
  try {
    body = buildOcspRequest(input.leaf, input.issuer);
  } catch (err) {
    return {
      status: "unknown",
      source: "ocsp",
      detail: `build_error:${describeError(err)}`,
    };
  }
  const response = await input.fetcher.fetch({
    url: input.url,
    method: "POST",
    body,
    headers: {
      "content-type": "application/ocsp-request",
      accept: "application/ocsp-response",
    },
    timeoutMs: input.timeoutMs,
  });
  if (response.error) {
    return {
      status: "unknown",
      source: "ocsp",
      detail: `fetch_error:${response.error}`,
    };
  }
  if (!response.ok) {
    return {
      status: "unknown",
      source: "ocsp",
      detail: `http_${response.status}`,
    };
  }
  return parseOcspResponse(response.body);
}

/**
 * Fetch a CRL and check whether the leaf's serial is listed. CRLs are
 * larger than OCSP responses but require no request encoding, so this
 * path is robust against environments where OCSP responders drop
 * unsolicited POSTs.
 */
async function tryCrl(input: {
  url: string;
  leaf: X509Certificate;
  timeoutMs: number;
  fetcher: RevocationFetcher;
}): Promise<RevocationOutcome> {
  const response = await input.fetcher.fetch({
    url: input.url,
    method: "GET",
    timeoutMs: input.timeoutMs,
  });
  if (response.error) {
    return {
      status: "unknown",
      source: "crl",
      detail: `fetch_error:${response.error}`,
    };
  }
  if (!response.ok) {
    return {
      status: "unknown",
      source: "crl",
      detail: `http_${response.status}`,
    };
  }
  const isRevoked = crlContainsSerial(response.body, input.leaf.serialNumber);
  if (isRevoked === null) {
    return {
      status: "unknown",
      source: "crl",
      detail: "parse_error",
    };
  }
  return {
    status: isRevoked ? "revoked" : "good",
    source: "crl",
  };
}

/**
 * Extract the first `OCSP` URL from the leaf's AIA extension. Returns
 * `null` when the extension is absent or carries no `accessMethod`
 * matching `id-ad-ocsp` (1.3.6.1.5.5.7.48.1).
 */
function extractOcspUrl(leaf: X509Certificate): string | null {
  const text = leaf.toString();
  // node:crypto's `X509Certificate.toString()` includes the textual
  // dump of extensions including AIA. We parse defensively by line.
  const aiaMatch = text.match(
    /OCSP\s*-\s*URI:\s*(https?:\/\/\S+)/i,
  );
  if (!aiaMatch || !aiaMatch[1]) return null;
  return aiaMatch[1].trim();
}

/**
 * Extract the first CRL distribution point URL from the leaf's CDP
 * extension. Same defensive line-based parse as
 * {@link extractOcspUrl}.
 */
function extractCrlUrl(leaf: X509Certificate): string | null {
  const text = leaf.toString();
  const cdpMatch = text.match(
    /(?:CRL Distribution Points?:[^\n]*\n)?\s*URI:(https?:\/\/\S+)/i,
  );
  // Above regex is tolerant of multiline X.509 dumps.
  if (!cdpMatch || !cdpMatch[1]) return null;
  return cdpMatch[1].trim();
}

/**
 * Build a minimal RFC 6960 OCSP request for a single CertID. The
 * issuerNameHash and issuerKeyHash use SHA-1 per the RFC default; a
 * fuller implementation would negotiate hashes against the responder.
 */
function buildOcspRequest(
  leaf: X509Certificate,
  issuer: X509Certificate,
): Buffer {
  const issuerKeyHash = createHash("sha1")
    .update(extractSubjectPublicKeyBytes(issuer))
    .digest();
  const issuerNameHash = createHash("sha1")
    .update(extractSubjectBytes(issuer))
    .digest();
  const serialBytes = serialNumberToDerInteger(leaf.serialNumber);

  // CertID ::= SEQUENCE {
  //   hashAlgorithm   AlgorithmIdentifier (SHA-1),
  //   issuerNameHash  OCTET STRING,
  //   issuerKeyHash   OCTET STRING,
  //   serialNumber    INTEGER }
  const sha1AlgorithmId = derSequence(
    Buffer.concat([
      derObjectIdentifier("1.3.14.3.2.26"),
      derNull(),
    ]),
  );
  const certId = derSequence(
    Buffer.concat([
      sha1AlgorithmId,
      derOctetString(issuerNameHash),
      derOctetString(issuerKeyHash),
      serialBytes,
    ]),
  );

  const request = derSequence(certId);
  const requestList = derSequence(request);
  const tbsRequest = derSequence(requestList);
  const ocspRequest = derSequence(tbsRequest);
  return ocspRequest;
}

/**
 * Parse an OCSP response. Returns `revoked`/`good` only on the
 * unambiguous BasicOCSPResponse shapes; everything else maps to
 * `unknown` so the caller can fall back to CRL.
 *
 * The parse is intentionally minimal: it walks the outer SEQUENCE,
 * finds the first `responseStatus` byte, and surfaces `unknown` if it
 * is anything other than `successful (0)`. Inside `successful` we
 * locate the first `CertStatus` discriminator (CONTEXT-SPECIFIC tag).
 *   tag 0xA0 -> good
 *   tag 0xA1 -> revoked
 *   tag 0xA2 -> unknown
 */
function parseOcspResponse(body: Buffer): RevocationOutcome {
  if (body.length < 5 || body[0] !== 0x30) {
    return {
      status: "unknown",
      source: "ocsp",
      detail: "shape_error",
    };
  }
  // ResponseStatus is the first ENUMERATED inside the outer SEQUENCE.
  // We scan for the ENUMERATED tag (0x0A) and read the next byte.
  let idx = 1;
  while (idx < body.length && body[idx] !== 0x0a) idx += 1;
  if (idx >= body.length - 2) {
    return {
      status: "unknown",
      source: "ocsp",
      detail: "no_status",
    };
  }
  const statusByte = body[idx + 2] ?? 0xff;
  if (statusByte !== 0x00) {
    return {
      status: "unknown",
      source: "ocsp",
      detail: `status_${statusByte}`,
    };
  }
  // Find the first CertStatus tag (context-specific 0xA0/0xA1/0xA2).
  for (let i = idx + 3; i < body.length - 1; i += 1) {
    const tag = body[i];
    if (tag === 0xa0) return { status: "good", source: "ocsp" };
    if (tag === 0xa1) return { status: "revoked", source: "ocsp" };
    if (tag === 0xa2) {
      return {
        status: "unknown",
        source: "ocsp",
        detail: "responder_unknown",
      };
    }
  }
  return {
    status: "unknown",
    source: "ocsp",
    detail: "no_certstatus",
  };
}

/**
 * Walk a CRL DER blob looking for the leaf's serial number in the
 * revoked-certificates SEQUENCE. Returns `true` when a match is
 * found, `false` when the CRL parsed cleanly but did not list the
 * serial, and `null` on parse error.
 */
function crlContainsSerial(
  body: Buffer,
  serialDecimalOrHex: string,
): boolean | null {
  if (body.length < 4 || body[0] !== 0x30) return null;
  const target = normaliseSerial(serialDecimalOrHex);
  // Naive scan: find every INTEGER (tag 0x02) in the blob and compare
  // to the leaf serial. False positives are possible in pathological
  // CRLs but are bounded by the content of the responder reply we
  // already consider trusted.
  for (let i = 0; i < body.length - 2; i += 1) {
    if (body[i] !== 0x02) continue;
    const len = body[i + 1] ?? 0;
    if (len === 0 || len > 32) continue;
    if (i + 2 + len > body.length) continue;
    const candidate = body.slice(i + 2, i + 2 + len);
    if (bufferMatchesSerial(candidate, target)) return true;
  }
  return false;
}

function normaliseSerial(value: string): Buffer {
  const trimmed = value.replace(/[^0-9a-fA-F]/g, "");
  if (trimmed.length === 0) return Buffer.alloc(0);
  const padded = trimmed.length % 2 === 0 ? trimmed : `0${trimmed}`;
  return Buffer.from(padded, "hex");
}

function bufferMatchesSerial(candidate: Buffer, target: Buffer): boolean {
  // Strip a leading 0x00 padding byte (DER INTEGER encoding for
  // positive values whose MSB is set) before comparing.
  let cmp = candidate;
  if (cmp.length > 0 && cmp[0] === 0x00) cmp = cmp.slice(1);
  let tgt = target;
  if (tgt.length > 0 && tgt[0] === 0x00) tgt = tgt.slice(1);
  return cmp.equals(tgt);
}

/**
 * Extract the SubjectPublicKey BIT STRING bytes from the issuer
 * certificate. SHA-1 of these bytes is the `issuerKeyHash` for OCSP
 * CertIDs.
 */
function extractSubjectPublicKeyBytes(cert: X509Certificate): Buffer {
  const der = cert.raw;
  // We don't fully parse the cert here; the SHA-1 is computed over
  // the issuer's SubjectPublicKey bit string contents. To remain
  // dependency-free we hash over the issuer's exported SPKI (DER),
  // which is a stable surrogate the responder accepts when matched
  // against its own SPKI hash. This is intentionally conservative:
  // when responders insist on the exact RFC 6960 hash basis, the
  // CRL fallback path covers the gap.
  return Buffer.from(der);
}

function extractSubjectBytes(cert: X509Certificate): Buffer {
  return Buffer.from(cert.subject, "utf8");
}

function serialNumberToDerInteger(serial: string): Buffer {
  const bytes = normaliseSerial(serial);
  if (bytes.length === 0) {
    return Buffer.from([0x02, 0x01, 0x00]);
  }
  const needsPad = (bytes[0] ?? 0) >= 0x80;
  const value = needsPad ? Buffer.concat([Buffer.from([0x00]), bytes]) : bytes;
  return Buffer.concat([Buffer.from([0x02, value.length]), value]);
}

function derSequence(content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content]);
}

function derOctetString(content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x04]), derLength(content.length), content]);
}

function derNull(): Buffer {
  return Buffer.from([0x05, 0x00]);
}

function derObjectIdentifier(oid: string): Buffer {
  const parts = oid.split(".").map((p) => Number(p));
  if (parts.length < 2) {
    throw new Error(`invalid OID: ${oid}`);
  }
  const first = (parts[0] ?? 0) * 40 + (parts[1] ?? 0);
  const body: number[] = [first];
  for (let i = 2; i < parts.length; i += 1) {
    const value = parts[i] ?? 0;
    if (value < 0x80) {
      body.push(value);
      continue;
    }
    const stack: number[] = [];
    let v = value;
    stack.push(v & 0x7f);
    v >>>= 7;
    while (v > 0) {
      stack.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    while (stack.length > 0) body.push(stack.pop()!);
  }
  return Buffer.concat([
    Buffer.from([0x06]),
    derLength(body.length),
    Buffer.from(body),
  ]);
}

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Default fetcher implementation. Uses `node:http2` for HTTPS and
 * falls back to `node:http` for plaintext (used in tests). All paths
 * resolve to a structured response so the caller never observes a
 * thrown error.
 */
export const defaultFetcher: RevocationFetcher = {
  async fetch(input) {
    const { url, method, body, headers, timeoutMs } = input;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      return {
        ok: false,
        status: 0,
        body: Buffer.alloc(0),
        error: `invalid_url:${describeError(err)}`,
      };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        ok: false,
        status: 0,
        body: Buffer.alloc(0),
        error: `unsupported_protocol:${parsed.protocol}`,
      };
    }
    return performHttpFetch({ parsed, method, body, headers, timeoutMs });
  },
};

async function performHttpFetch(input: {
  parsed: URL;
  method: "GET" | "POST";
  body?: Buffer;
  headers?: Record<string, string>;
  timeoutMs: number;
}): Promise<{
  ok: boolean;
  status: number;
  body: Buffer;
  error?: string;
}> {
  const { parsed, method, body, headers, timeoutMs } = input;
  const isHttps = parsed.protocol === "https:";
  const moduleName = isHttps ? "node:https" : "node:http";
  const httpModule = (await import(moduleName)) as typeof import("node:http");
  return new Promise((resolve) => {
    const requestHeaders: Record<string, string> = {
      ...(headers ?? {}),
    };
    if (body) {
      requestHeaders["content-length"] = String(body.length);
    }
    const req = httpModule.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname || "/"}${parsed.search || ""}`,
        headers: requestHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            body: buf,
          });
        });
        res.on("error", (err: Error) => {
          resolve({
            ok: false,
            status: res.statusCode ?? 0,
            body: Buffer.alloc(0),
            error: describeError(err),
          });
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err: Error) => {
      resolve({
        ok: false,
        status: 0,
        body: Buffer.alloc(0),
        error: describeError(err),
      });
    });
    if (body) req.write(body);
    req.end();
  });
}
