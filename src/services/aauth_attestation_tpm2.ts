/**
 * WebAuthn `tpm` attestation statement verifier (W3C WebAuthn §8.3).
 *
 * The statement carries an Attestation Identity Key (AIK) chain, a
 * signature over the TPM `certInfo` quote, and a `pubArea` describing
 * the bound key:
 *
 * ```ts
 * {
 *   ver: "2.0";
 *   alg: number;          // COSE algorithm of the AIK signature
 *   x5c: string[];        // base64url DER chain, leaf-first
 *   sig: string;          // base64url signature over `certInfo`
 *   certInfo: string;     // base64url big-endian TPMS_ATTEST quote
 *   pubArea: string;      // base64url big-endian TPMT_PUBLIC of the bound key
 * }
 * ```
 *
 * Verification ordering, mirroring the Apple SE / WebAuthn-packed
 * verifiers and `docs/subsystems/aauth_attestation.md`:
 *
 *   1. Parse the statement into a typed shape; reject `ver !== "2.0"`
 *      as `unsupported_format`.
 *   2. Decode the AIK chain (leaf-first) and confirm the leaf
 *      certificate carries a usable public key.
 *   3. Decode `pubArea` as `TPMT_PUBLIC`, derive a node:crypto
 *      `KeyObject` for the bound key, and bind it to `cnf.jwk` via
 *      RFC 7638 thumbprint (constant-time).
 *   4. Walk the AIK chain leaf→root and confirm the terminal cert is
 *      rooted in the merged attestation trust set (which includes the
 *      bundled TPM CA roots from `config/aauth/tpm_attestation_roots/`).
 *   5. Verify `sig` over the raw `certInfo` bytes using the AIK leaf
 *      public key and the COSE-derived signing algorithm.
 *   6. Decode `certInfo` as `TPMS_ATTEST`; validate `magic`/`type`,
 *      compare `extraData` against `SHA-256(challenge || jkt)`, and
 *      (for `TPM_ST_ATTEST_CERTIFY` payloads) confirm the certified
 *      `name` matches `nameAlg || digest(pubArea)`.
 *
 * Failure modes never throw; every input shape produces a structured
 * outcome so the AAuth middleware can record the diagnostic reason
 * without rejecting the request. Failed attestation cascades to the
 * operator-allowlist tier or `software` per the cascade rules.
 *
 * Out of scope (per FU-2026-Q3-aauth-tpm2-verifier):
 *   - TPM 1.2 quote payloads. `ver !== "2.0"` short-circuits.
 *   - Live TPM hardware in tests; fixtures are synthetic byte buffers.
 *   - External TPM library dependencies. Parser is hand-written.
 */

import {
  X509Certificate,
  createHash,
  createPublicKey,
  createVerify,
  type KeyObject,
} from "node:crypto";
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
import {
  TPM_ALG_SHA1,
  TPM_ALG_SHA256,
  TPM_ALG_SHA384,
  TPM_ALG_SHA512,
  TPM_ST_ATTEST_CERTIFY,
  TPM_ST_ATTEST_QUOTE,
  TpmStructuresError,
  parseTpmsAttest,
  parseTpmtPublic,
  type TpmtPublicKey,
} from "./aauth_tpm_structures.js";

const TPM2_FORMAT = "tpm2" as const;

interface Tpm2Statement {
  ver: string;
  alg: number;
  sig: string;
  x5c: string[];
  certInfo: string;
  pubArea: string;
}

type SupportedAlg =
  | { kind: "ecdsa"; hash: "SHA256" }
  | { kind: "ecdsa"; hash: "SHA384" }
  | { kind: "rsa-pkcs1"; hash: "SHA256" }
  | { kind: "rsa-pss"; hash: "SHA256" };

/**
 * Translate a COSE algorithm identifier to a node:crypto-friendly
 * descriptor. Returns `null` for unsupported algorithms; the verifier
 * surfaces this as `signature_invalid`.
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
 * Verify a WebAuthn `tpm` envelope. The dispatcher in
 * {@link verifyAttestation} guarantees that `envelope.format` is
 * `"tpm2"`, the challenge precheck has already succeeded, and the
 * statement is a non-null object.
 */
export async function verifyTpm2Attestation(
  envelope: { statement: unknown; challenge: string; format: string },
  ctx: AttestationContext
): Promise<AttestationOutcome> {
  const parsed = parseStatement(envelope.statement);
  if (!parsed) return failure("malformed");
  if (parsed.ver !== "2.0") return failure("unsupported_format");
  if (resolveCoseAlg(parsed.alg) === null) return failure("signature_invalid");

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

  let pubAreaBytes: Buffer;
  let certInfoBytes: Buffer;
  let signatureBytes: Buffer;
  try {
    pubAreaBytes = base64urlDecode(parsed.pubArea);
    certInfoBytes = base64urlDecode(parsed.certInfo);
    signatureBytes = base64urlDecode(parsed.sig);
  } catch {
    return failure("malformed");
  }

  let tpmtPublic: TpmtPublicKey;
  try {
    tpmtPublic = parseTpmtPublic(pubAreaBytes);
  } catch (err) {
    return failure(err instanceof TpmStructuresError ? "malformed" : "malformed");
  }

  let boundKey: KeyObject;
  try {
    boundKey = tpmtPublicToKeyObject(tpmtPublic);
  } catch {
    return failure("malformed");
  }

  let boundJkt: string;
  try {
    const jwk = await exportJWK(boundKey);
    boundJkt = await calculateJwkThumbprint(jwk as Parameters<typeof calculateJwkThumbprint>[0]);
  } catch {
    return failure("malformed");
  }
  if (!constantTimeStringEquals(boundJkt, ctx.boundJkt)) {
    return failure("key_binding_failed");
  }

  if (!walkChainAgainstTrust(chain, ctx)) {
    return failure("chain_invalid");
  }

  if (!verifySignatureForAlg(parsed.alg, leafKey, certInfoBytes, signatureBytes)) {
    return failure("signature_invalid");
  }

  let attest;
  try {
    attest = parseTpmsAttest(certInfoBytes);
  } catch {
    return failure("malformed");
  }

  if (attest.type !== TPM_ST_ATTEST_QUOTE && attest.type !== TPM_ST_ATTEST_CERTIFY) {
    return failure("unsupported_format");
  }

  const expectedExtra = computeBoundChallengeDigest(envelope.challenge, ctx.boundJkt);
  if (!constantTimeBufferEquals(attest.extraData, expectedExtra)) {
    return failure("challenge_mismatch");
  }

  if (attest.attested.kind === "certify") {
    if (!verifyCertifyName(attest.attested.name, pubAreaBytes)) {
      return failure("pubarea_mismatch");
    }
  }

  // Final step: revocation (FU-2026-Q4-aauth-attestation-revocation).
  // TPM 2.0 AIK chains use standard X.509 OCSP/CRL via the shared
  // revocation service.
  const mode = readRevocationMode();
  if (mode === "disabled") {
    return { verified: true, format: TPM2_FORMAT };
  }
  const revocation = await checkRevocation({
    chain,
    format: TPM2_FORMAT,
  });
  return applyRevocationPolicy(
    { verified: true, format: TPM2_FORMAT },
    {
      mode,
      failOpen: readFailOpen(),
      revocation,
    }
  );
}

function parseStatement(raw: unknown): Tpm2Statement | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const ver = obj.ver;
  const alg = obj.alg;
  const sig = obj.sig;
  const x5c = obj.x5c;
  const certInfo = obj.certInfo;
  const pubArea = obj.pubArea;
  if (typeof ver !== "string" || ver.length === 0) return null;
  if (typeof alg !== "number" || !Number.isInteger(alg)) return null;
  if (typeof sig !== "string" || sig.length === 0) return null;
  if (!Array.isArray(x5c) || x5c.length === 0) return null;
  if (!x5c.every((entry) => typeof entry === "string" && entry.length > 0)) {
    return null;
  }
  if (typeof certInfo !== "string" || certInfo.length === 0) return null;
  if (typeof pubArea !== "string" || pubArea.length === 0) return null;
  return {
    ver,
    alg,
    sig,
    x5c: x5c as string[],
    certInfo,
    pubArea,
  };
}

/**
 * Convert a parsed `TPMT_PUBLIC` payload into a `node:crypto`
 * `KeyObject`. RSA keys round-trip through JWK so we get canonical
 * base64url encoding; ECC keys are constructed via JWK with
 * left-padded `x` / `y` coordinates.
 */
function tpmtPublicToKeyObject(parsed: TpmtPublicKey): KeyObject {
  if (parsed.type === "rsa") {
    const jwk = {
      kty: "RSA",
      n: bufferToBase64Url(parsed.n),
      e: bufferToBase64Url(parsed.e),
    };
    return createPublicKey({ key: jwk, format: "jwk" });
  }
  const componentSize = parsed.curve === "P-256" ? 32 : parsed.curve === "P-384" ? 48 : 66;
  const jwk = {
    kty: "EC",
    crv: parsed.curve,
    x: bufferToBase64Url(leftPad(parsed.x, componentSize)),
    y: bufferToBase64Url(leftPad(parsed.y, componentSize)),
  };
  return createPublicKey({ key: jwk, format: "jwk" });
}

function leftPad(buf: Buffer, length: number): Buffer {
  if (buf.length >= length) return buf.subarray(buf.length - length);
  const pad = Buffer.alloc(length - buf.length);
  return Buffer.concat([pad, buf]);
}

function verifySignatureForAlg(
  alg: number,
  publicKey: KeyObject,
  message: Buffer,
  signature: Buffer
): boolean {
  const resolved = resolveCoseAlg(alg);
  if (!resolved) return false;
  try {
    if (resolved.kind === "ecdsa") {
      const v = createVerify(resolved.hash);
      v.update(message);
      v.end();
      return v.verify(publicKey, signature);
    }
    if (resolved.kind === "rsa-pkcs1") {
      const v = createVerify(resolved.hash);
      v.update(message);
      v.end();
      return v.verify(publicKey, signature);
    }
    if (resolved.kind === "rsa-pss") {
      const v = createVerify(resolved.hash);
      v.update(message);
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
    if (tail.fingerprint256 === trusted.fingerprint256) return true;
    try {
      const trustedKey = trusted.publicKey;
      if (!trustedKey) continue;
      if (tail.verify(trustedKey)) return true;
    } catch {
      // Continue.
    }
  }
  return false;
}

/**
 * Verify a `TPM2B_NAME` against a `pubArea` blob:
 *   name = nameAlg (UINT16, big-endian) || digest(pubArea, alg)
 */
function verifyCertifyName(name: Buffer, pubArea: Buffer): boolean {
  if (name.length < 2) return false;
  const nameAlg = name.readUInt16BE(0);
  const digestAlg = mapTpmAlgToHash(nameAlg);
  if (!digestAlg) return false;
  const expectedDigest = createHash(digestAlg).update(pubArea).digest();
  const declaredDigest = name.subarray(2);
  if (declaredDigest.length !== expectedDigest.length) return false;
  return constantTimeBufferEquals(declaredDigest, expectedDigest);
}

function mapTpmAlgToHash(alg: number): string | null {
  switch (alg) {
    case TPM_ALG_SHA1:
      return "sha1";
    case TPM_ALG_SHA256:
      return "sha256";
    case TPM_ALG_SHA384:
      return "sha384";
    case TPM_ALG_SHA512:
      return "sha512";
    default:
      return null;
  }
}

function failure(reason: AttestationOutcomeReason): AttestationOutcome {
  return { verified: false, format: TPM2_FORMAT, reason };
}

type AttestationOutcomeReason = Extract<AttestationOutcome, { verified: false }>["reason"];

function base64urlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function bufferToBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function constantTimeStringEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function constantTimeBufferEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i]! ^ b[i]!;
  }
  return mismatch === 0;
}
