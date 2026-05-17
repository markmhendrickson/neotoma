/**
 * WebAuthn `packed` attestation statement verifier (W3C WebAuthn §8.2).
 *
 * Verifies a JSON-native `cnf.attestation` envelope with
 * `format: "webauthn-packed"`. The statement carries:
 *
 * ```ts
 * {
 *   alg: number;          // COSE algorithm identifier
 *   sig: string;          // base64url signature
 *   x5c: string[];        // base64url DER chain, leaf-first
 *   ecdaaKeyId?: string;  // (deprecated) ECDAA path, rejected
 * }
 * ```
 *
 * Verification ordering, mirroring the Apple SE verifier and
 * `docs/subsystems/aauth_attestation.md`:
 *
 *   1. Parse the statement into a typed shape.
 *   2. Parse the `x5c` chain and confirm a valid leaf certificate.
 *   3. Optional AAGUID admission — when the leaf cert carries the FIDO
 *      `id-fido-gen-ce-aaguid` extension (OID 1.3.6.1.4.1.45724.1.1.4)
 *      AND the operator trust list (`webauthnAaguidAllowlist`) is
 *      non-empty, the extracted AAGUID MUST be in the list.
 *   4. Bind the leaf credential public key to `cnf.jwk` via RFC 7638
 *      thumbprint (constant-time).
 *   5. Walk the chain leaf→root and confirm the terminal certificate
 *      is rooted in the merged attestation trust set.
 *   6. Verify `sig` over `SHA-256(challenge || jkt)` using the leaf
 *      public key and the COSE-derived signing algorithm.
 *
 * Failure modes never throw; every input shape produces a structured
 * outcome so the AAuth middleware can record the diagnostic reason
 * without rejecting the request. Failed attestation cascades to the
 * operator-allowlist tier or `software` per the cascade rules.
 *
 * Out of scope (per FU-2026-Q3-aauth-webauthn-packed-verifier):
 *   - ECDAA path (deprecated by W3C). Statements carrying `ecdaaKeyId`
 *     are rejected with `signature_invalid` (the dispatcher reserves
 *     `unsupported_format` for unknown discriminators).
 *   - FIDO U2F attestation format (legacy register-only).
 *   - Anonymous-attestation paths that bypass the standard `x5c`
 *     chain. Those will surface as `chain_invalid` until a follow-up
 *     FU bundles the necessary roots.
 */

import { X509Certificate, createVerify, type KeyObject } from "node:crypto";
import { calculateJwkThumbprint, exportJWK } from "jose";

import {
  applyRevocationPolicy,
  computeBoundChallengeDigest,
} from "./aauth_attestation_verifier.js";
import type { AttestationContext, AttestationOutcome } from "./aauth_attestation_verifier.js";
import {
  checkRevocation,
  readFailOpen,
  readRevocationMode,
} from "./aauth_attestation_revocation.js";

const WEBAUTHN_PACKED_FORMAT = "webauthn-packed" as const;

const FIDO_AAGUID_EXTENSION_OID = "1.3.6.1.4.1.45724.1.1.4";

interface WebauthnPackedStatement {
  alg: number;
  sig: string;
  x5c: string[];
  ecdaaKeyId?: string;
}

type SupportedAlg =
  | { kind: "ecdsa"; hash: "SHA256" }
  | { kind: "ecdsa"; hash: "SHA384" }
  | { kind: "rsa-pkcs1"; hash: "SHA256" }
  | { kind: "rsa-pss"; hash: "SHA256" };

/**
 * Translate a COSE algorithm identifier to a node:crypto-friendly
 * descriptor. Returns `null` for unsupported algorithms — the verifier
 * surfaces this as `signature_invalid` so the failure surfaces in the
 * decision diagnostics rather than silently demoting to a different
 * reason code.
 */
function resolveCoseAlg(alg: number): SupportedAlg | null {
  switch (alg) {
    case -7:
      return { kind: "ecdsa", hash: "SHA256" };
    case -35:
      return { kind: "ecdsa", hash: "SHA384" };
    case -257:
      return { kind: "rsa-pkcs1", hash: "SHA256" };
    case -37:
      return { kind: "rsa-pss", hash: "SHA256" };
    default:
      return null;
  }
}

/**
 * Verify a WebAuthn `packed` envelope. The dispatcher in
 * {@link verifyAttestation} guarantees that `envelope.format` is
 * `"webauthn-packed"`, the challenge precheck has already succeeded,
 * and the statement is a non-null object.
 */
export async function verifyWebauthnPackedAttestation(
  envelope: { statement: unknown; challenge: string; format: string },
  ctx: AttestationContext
): Promise<AttestationOutcome> {
  const parsed = parseStatement(envelope.statement);
  if (!parsed) {
    return failure("malformed");
  }
  if (parsed.ecdaaKeyId !== undefined) {
    // ECDAA is deprecated by W3C and intentionally not supported. The
    // dispatcher reserves `unsupported_format` for unknown format
    // discriminators, so reuse `signature_invalid` here — the agent
    // can see the failure_reason in decision diagnostics.
    return failure("signature_invalid");
  }
  if (resolveCoseAlg(parsed.alg) === null) {
    return failure("signature_invalid");
  }

  let chain: X509Certificate[];
  try {
    chain = parsed.x5c.map((b64) => new X509Certificate(base64urlDecode(b64)));
  } catch {
    return failure("chain_invalid");
  }
  if (chain.length === 0) return failure("chain_invalid");
  const leaf = chain[0]!;

  const leafKey = leaf.publicKey;
  if (!leafKey) return failure("chain_invalid");

  // Step 3: AAGUID admission. The FIDO extension is optional; when
  // absent and the operator allowlist is non-empty we treat the
  // chain as inadmissible (a non-empty allowlist is a deliberate
  // operator declaration).
  const allowlist = ctx.trustConfig.webauthnAaguidAllowlist;
  if (allowlist.length > 0) {
    const aaguid = extractAaguidExtension(leaf);
    if (!aaguid || !allowlist.includes(aaguid)) {
      return failure("aaguid_not_trusted");
    }
  }

  // Step 4: key binding via RFC 7638 thumbprint comparison.
  let leafJkt: string;
  try {
    const leafJwk = await exportJWK(leafKey);
    leafJkt = await calculateJwkThumbprint(leafJwk as Parameters<typeof calculateJwkThumbprint>[0]);
  } catch {
    return failure("malformed");
  }
  if (!constantTimeStringEquals(leafJkt, ctx.boundJkt)) {
    return failure("key_binding_failed");
  }

  // Step 5: walk the chain to a trusted root. Reuses the same shape
  // as the Apple SE verifier, but each format keeps its own copy so
  // future per-format relaxations (e.g. WebAuthn metadata-service
  // status checks) stay isolated.
  if (!walkChainAgainstTrust(chain, ctx)) {
    return failure("chain_invalid");
  }

  // Step 6: signature verification over `SHA-256(challenge || jkt)`.
  const digest = computeBoundChallengeDigest(envelope.challenge, ctx.boundJkt);

  let signatureBytes: Buffer;
  try {
    signatureBytes = base64urlDecode(parsed.sig);
  } catch {
    return failure("malformed");
  }

  const ok = verifySignatureForAlg(parsed.alg, leafKey, digest, signatureBytes);
  if (!ok) {
    return failure("signature_invalid");
  }

  // Step 7: revocation (FU-2026-Q4-aauth-attestation-revocation).
  // WebAuthn-packed (including YubiKey) statements use standard X.509
  // OCSP/CRL via the shared revocation service.
  const mode = readRevocationMode();
  if (mode === "disabled") {
    return { verified: true, format: WEBAUTHN_PACKED_FORMAT };
  }
  const revocation = await checkRevocation({
    chain,
    format: WEBAUTHN_PACKED_FORMAT,
  });
  return applyRevocationPolicy(
    { verified: true, format: WEBAUTHN_PACKED_FORMAT },
    {
      mode,
      failOpen: readFailOpen(),
      revocation,
    }
  );
}

function parseStatement(raw: unknown): WebauthnPackedStatement | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const alg = obj.alg;
  const sig = obj.sig;
  const x5c = obj.x5c;
  const ecdaaKeyId = obj.ecdaaKeyId;
  if (typeof alg !== "number" || !Number.isInteger(alg)) return null;
  if (typeof sig !== "string" || sig.length === 0) return null;
  if (!Array.isArray(x5c) || x5c.length === 0) return null;
  if (!x5c.every((entry) => typeof entry === "string" && entry.length > 0)) {
    return null;
  }
  if (ecdaaKeyId !== undefined && typeof ecdaaKeyId !== "string") {
    return null;
  }
  const out: WebauthnPackedStatement = {
    alg,
    sig,
    x5c: x5c as string[],
  };
  if (ecdaaKeyId !== undefined) out.ecdaaKeyId = ecdaaKeyId as string;
  return out;
}

/**
 * Verify the signature using the COSE-resolved algorithm. We recreate
 * the verifier fresh per call rather than cache because `createVerify`
 * accumulates state.
 */
function verifySignatureForAlg(
  alg: number,
  publicKey: KeyObject,
  digest: Buffer,
  signature: Buffer
): boolean {
  const resolved = resolveCoseAlg(alg);
  if (!resolved) return false;

  // node:crypto's createVerify hashes the input itself; our `digest`
  // is the already-hashed `SHA-256(challenge || jkt)` payload. To
  // match the Apple SE verifier semantics we feed `digest` as the
  // message and let the verifier hash it again with the COSE-specified
  // hash. This mirrors how the WebAuthn signature contract operates
  // over the assertion data: signers commit to a server-side digest
  // exactly as the SE verifier does, so the bytes verifiers consume
  // are interchangeable across formats.
  try {
    if (resolved.kind === "ecdsa") {
      const v = createVerify(resolved.hash);
      v.update(digest);
      v.end();
      return v.verify(publicKey, signature);
    }
    if (resolved.kind === "rsa-pkcs1") {
      const v = createVerify(resolved.hash);
      v.update(digest);
      v.end();
      return v.verify(publicKey, signature);
    }
    if (resolved.kind === "rsa-pss") {
      const v = createVerify(resolved.hash);
      v.update(digest);
      v.end();
      return v.verify(
        {
          key: publicKey,
          padding: 6, // RSA_PKCS1_PSS_PADDING
          saltLength: 32,
        } as Parameters<typeof v.verify>[0],
        signature
      );
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract the FIDO AAGUID from the leaf cert's
 * `id-fido-gen-ce-aaguid` extension. Returns a lower-case hyphenated
 * UUID string, or `null` when the extension is absent / malformed.
 *
 * The extension value is DER-encoded as `OCTET STRING { OCTET STRING }`:
 * the outer OCTET STRING wraps the inner extension contents, and the
 * inner OCTET STRING wraps the 16-byte AAGUID. Different authenticators
 * have been observed to produce both single- and double-wrapped
 * encodings in the wild, so we accept either.
 */
function extractAaguidExtension(cert: X509Certificate): string | null {
  // node:crypto's X509Certificate does not expose extensions directly,
  // but the PEM/DER form is available via `raw`. We avoid pulling in
  // a full ASN.1 parser by walking the DER bytes for the AAGUID OID
  // and extracting the OCTET STRING that follows.
  const der = cert.raw;
  const oidBytes = encodeOid(FIDO_AAGUID_EXTENSION_OID);
  const idx = indexOfBytes(der, oidBytes);
  if (idx < 0) return null;

  // After the OID, the extension can carry a BOOLEAN (critical flag)
  // and then an OCTET STRING. Walk forward looking for the OCTET STRING
  // tag (0x04). We accept the first OCTET STRING within a small
  // bounded window so we do not collide with later certs in the same
  // DER (e.g. when a list of certs is concatenated).
  let cursor = idx + oidBytes.length;
  const SCAN_LIMIT = Math.min(der.length, cursor + 64);
  while (cursor < SCAN_LIMIT) {
    if (der[cursor] === 0x04) {
      const lenInfo = readDerLength(der, cursor + 1);
      if (!lenInfo) return null;
      const valueStart = cursor + 1 + lenInfo.lengthBytes;
      const valueEnd = valueStart + lenInfo.length;
      if (valueEnd > der.length) return null;

      // Outer OCTET STRING contents may be the raw 16-byte AAGUID or
      // an inner OCTET STRING wrapping it (DER `OCTET STRING { OCTET
      // STRING }`).
      let payloadStart = valueStart;
      let payloadEnd = valueEnd;
      if (der[valueStart] === 0x04 && valueStart + 1 < valueEnd) {
        const innerLenInfo = readDerLength(der, valueStart + 1);
        if (innerLenInfo && innerLenInfo.length === 16) {
          payloadStart = valueStart + 1 + innerLenInfo.lengthBytes;
          payloadEnd = payloadStart + 16;
        }
      }

      if (payloadEnd - payloadStart !== 16) return null;
      const aaguidBytes = der.subarray(payloadStart, payloadEnd);
      return formatAaguid(aaguidBytes);
    }
    cursor += 1;
  }
  return null;
}

/**
 * Walk the chain ensuring each non-terminal certificate verifies
 * under the next, and that the terminal certificate is itself
 * trusted (root in the merged trust set) or verifies under one of
 * the trusted roots.
 */
function walkChainAgainstTrust(chain: X509Certificate[], ctx: AttestationContext): boolean {
  for (let i = 0; i < chain.length - 1; i += 1) {
    const cert = chain[i]!;
    const issuer = chain[i + 1]!;
    try {
      const issuerKey = issuer.publicKey;
      if (!issuerKey) return false;
      if (!cert.verify(issuerKey)) return false;
    } catch {
      return false;
    }
  }

  const tail = chain[chain.length - 1]!;
  for (const trusted of ctx.trustConfig.attestationRoots) {
    if (certificatesEqual(tail, trusted)) return true;
    try {
      const trustedKey = trusted.publicKey;
      if (!trustedKey) continue;
      if (tail.verify(trustedKey)) return true;
    } catch {
      // Try the next trusted root.
    }
  }
  return false;
}

function certificatesEqual(a: X509Certificate, b: X509Certificate): boolean {
  return a.fingerprint256 === b.fingerprint256;
}

function failure(reason: AttestationOutcomeReason): AttestationOutcome {
  return { verified: false, format: WEBAUTHN_PACKED_FORMAT, reason };
}

type AttestationOutcomeReason = Extract<AttestationOutcome, { verified: false }>["reason"];

function base64urlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function constantTimeStringEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Encode a dotted OID string into its DER content bytes (the
 * `OBJECT IDENTIFIER` value sans the leading 0x06 tag and length
 * prefix). Used to locate the AAGUID extension by byte-scanning the
 * leaf certificate's DER, sidestepping the need for a full ASN.1
 * parser.
 */
function encodeOid(oid: string): Buffer {
  const parts = oid.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length < 2 || parts.some((v) => Number.isNaN(v))) {
    return Buffer.alloc(0);
  }
  const out: number[] = [];
  out.push(parts[0]! * 40 + parts[1]!);
  for (let i = 2; i < parts.length; i += 1) {
    const value = parts[i]!;
    if (value < 0x80) {
      out.push(value);
      continue;
    }
    const bytes: number[] = [];
    let v = value;
    while (v > 0) {
      bytes.push(v & 0x7f);
      v >>= 7;
    }
    for (let b = bytes.length - 1; b >= 0; b -= 1) {
      const byte = bytes[b]!;
      out.push(b === 0 ? byte : byte | 0x80);
    }
  }
  // The DER encoding inside a SEQUENCE prefixes the OID tag (0x06)
  // and length. Including those two bytes here keeps `indexOfBytes`
  // calls anchored to the actual ASN.1 marker rather than a coincidental
  // run of payload bytes.
  return Buffer.from([0x06, out.length, ...out]);
}

function indexOfBytes(haystack: Buffer, needle: Buffer): number {
  if (needle.length === 0) return -1;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

interface DerLengthInfo {
  length: number;
  lengthBytes: number;
}

function readDerLength(buf: Buffer, offset: number): DerLengthInfo | null {
  if (offset >= buf.length) return null;
  const first = buf[offset]!;
  if ((first & 0x80) === 0) {
    return { length: first, lengthBytes: 1 };
  }
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 4) return null;
  if (offset + 1 + numBytes > buf.length) return null;
  let length = 0;
  for (let i = 0; i < numBytes; i += 1) {
    length = (length << 8) | buf[offset + 1 + i]!;
  }
  return { length, lengthBytes: 1 + numBytes };
}

function formatAaguid(bytes: Buffer): string {
  if (bytes.length !== 16) return "";
  const hex = bytes.toString("hex").toLowerCase();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
