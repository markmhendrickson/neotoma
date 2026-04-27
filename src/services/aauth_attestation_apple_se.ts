/**
 * Apple Secure Enclave attestation verifier.
 *
 * Verifies a JSON-native `cnf.attestation` envelope with
 * `format: "apple-secure-enclave"`. The statement carries a base64url DER
 * X.509 chain (leaf first) terminating at an Apple-rooted intermediate,
 * plus an ECDSA-P256 signature over `SHA-256(challenge || jkt)` produced
 * by the leaf certificate's public key (the credential key generated in
 * the Secure Enclave).
 *
 * Verification ordering follows
 * `docs/subsystems/aauth_attestation.md`:
 *
 * 1. Parse the chain and confirm the leaf carries an EC P-256 public key.
 * 2. Confirm the leaf's RFC 7638 thumbprint matches the JWT-bound
 *    `cnf.jwk` thumbprint (key_binding_failed).
 * 3. Walk the chain (`X509Certificate#verify(issuerKey)`) up to a CA in
 *    the merged trust config; reject otherwise (chain_invalid).
 * 4. Verify the ECDSA signature over `SHA-256(challenge || jkt)` using
 *    the leaf's public key (signature_invalid).
 *
 * Revocation / OCSP is intentionally out of scope for v0.8.0; operators
 * rotate keys to expire trust.
 */

import {
  X509Certificate,
  createPublicKey,
  createVerify,
  type KeyObject,
} from "node:crypto";
import { calculateJwkThumbprint, exportJWK } from "jose";

import {
  applyRevocationPolicy,
  computeBoundChallengeDigest,
} from "./aauth_attestation_verifier.js";
import type {
  AttestationContext,
  AttestationOutcome,
} from "./aauth_attestation_verifier.js";
import {
  checkRevocation,
  readFailOpen,
  readRevocationMode,
} from "./aauth_attestation_revocation.js";

const APPLE_SE_FORMAT = "apple-secure-enclave" as const;

interface AppleSeStatement {
  attestation_chain: string[];
  signature: string;
}

/**
 * Validate the Apple SE envelope. Returns a structured outcome rather
 * than throwing so the AAuth middleware can record the reason on the
 * decision diagnostic block.
 */
export async function verifyAppleSecureEnclaveAttestation(
  envelope: { statement: unknown; challenge: string; format: string },
  ctx: AttestationContext,
): Promise<AttestationOutcome> {
  const parsed = parseStatement(envelope.statement);
  if (!parsed) {
    return failure("malformed");
  }

  let chain: X509Certificate[];
  try {
    chain = parsed.attestation_chain.map(
      (b64) => new X509Certificate(base64urlDecode(b64)),
    );
  } catch {
    return failure("malformed");
  }
  if (chain.length === 0) return failure("malformed");
  const leaf = chain[0]!;

  const leafKey = leaf.publicKey;
  if (!leafKey) return failure("malformed");

  if (!isP256PublicKey(leafKey)) {
    return failure("chain_invalid");
  }

  // Step 2: key binding. Compute the leaf's RFC 7638 thumbprint and
  // compare to the JWT-bound `cnf.jwk` thumbprint pre-computed by the
  // middleware. Mismatch means the attestation does not vouch for the
  // signing key currently in use.
  let leafJkt: string;
  try {
    const leafJwk = await exportJWK(leafKey);
    leafJkt = await calculateJwkThumbprint(
      leafJwk as Parameters<typeof calculateJwkThumbprint>[0],
    );
  } catch {
    return failure("malformed");
  }
  if (!constantTimeStringEquals(leafJkt, ctx.boundJkt)) {
    return failure("key_binding_failed");
  }

  // Step 3: chain validation. Walk the chain ensuring each cert verifies
  // under the next, and that the terminal cert is one of the trusted
  // roots (bundled Apple root + operator-supplied CAs).
  if (!walkChainAgainstTrust(chain, ctx)) {
    return failure("chain_invalid");
  }

  // Step 4: signature over `SHA-256(challenge || jkt)`. The middleware's
  // challenge precheck already confirmed the envelope challenge matches
  // what the server expected; we re-derive the digest input here so the
  // signature commits to both inputs cryptographically.
  const digest = computeBoundChallengeDigest(envelope.challenge, ctx.boundJkt);

  let signatureBytes: Buffer;
  try {
    signatureBytes = base64urlDecode(parsed.signature);
  } catch {
    return failure("malformed");
  }

  const verifier = createVerify("SHA256");
  verifier.update(digest);
  verifier.end();
  let ok = false;
  try {
    ok = verifier.verify(leafKey, signatureBytes);
  } catch {
    ok = false;
  }
  if (!ok) {
    return failure("signature_invalid");
  }

  // Step 5: revocation check (FU-2026-Q4-aauth-attestation-revocation).
  // Apple Secure Enclave attestations consult Apple's anonymous-
  // attestation revocation list; the result is folded back into the
  // outcome via the central revocation policy (no-op when mode is
  // `disabled`).
  const mode = readRevocationMode();
  if (mode === "disabled") {
    return { verified: true, format: APPLE_SE_FORMAT };
  }
  const revocation = await checkRevocation({
    chain,
    format: APPLE_SE_FORMAT,
  });
  return applyRevocationPolicy(
    { verified: true, format: APPLE_SE_FORMAT },
    {
      mode,
      failOpen: readFailOpen(),
      revocation,
    },
  );
}

function parseStatement(raw: unknown): AppleSeStatement | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const chain = obj.attestation_chain;
  const signature = obj.signature;
  if (!Array.isArray(chain) || chain.length === 0) return null;
  if (!chain.every((entry) => typeof entry === "string" && entry.length > 0)) {
    return null;
  }
  if (typeof signature !== "string" || signature.length === 0) return null;
  return {
    attestation_chain: chain as string[],
    signature,
  };
}

function isP256PublicKey(key: KeyObject): boolean {
  if (key.asymmetricKeyType !== "ec") return false;
  const details = key.asymmetricKeyDetails;
  if (!details) return false;
  return details.namedCurve === "prime256v1" || details.namedCurve === "P-256";
}

/**
 * Walk the certificate chain. Each non-terminal certificate must verify
 * under the next certificate's public key. The chain succeeds when the
 * terminal certificate is itself trusted (root in the merged trust set)
 * or verifies under one of the trusted roots.
 */
function walkChainAgainstTrust(
  chain: X509Certificate[],
  ctx: AttestationContext,
): boolean {
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
      // Ignore individual root failures — try the next trusted root.
    }
  }
  return false;
}

function certificatesEqual(a: X509Certificate, b: X509Certificate): boolean {
  return a.fingerprint256 === b.fingerprint256;
}

function failure(
  reason: AttestationOutcomeReason,
): AttestationOutcome {
  return { verified: false, format: APPLE_SE_FORMAT, reason };
}

type AttestationOutcomeReason = Extract<
  AttestationOutcome,
  { verified: false }
>["reason"];

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

// `createPublicKey` is referenced indirectly via `leaf.publicKey` but
// importing it keeps the surface explicit for future SPKI fallbacks.
void createPublicKey;
