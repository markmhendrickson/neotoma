/**
 * Unit tests for `src/services/aauth_attestation_verifier.ts`.
 *
 * Focuses on the format-dispatching layer: malformed envelopes, missing
 * fields, challenge mismatches, unsupported formats, and the cheap
 * precheck that the envelope's challenge matches the server-recomputed
 * value. Format-specific cryptography lives in its own file and has its
 * own tests.
 */

import { describe, expect, it } from "vitest";

import {
  applyRevocationPolicy,
  computeBoundChallengeDigest,
  computeExpectedChallenge,
  verifyAttestation,
  type AttestationContext,
  type AttestationEnvelope,
  type AttestationOutcome,
} from "../../src/services/aauth_attestation_verifier.js";
import type { AttestationTrustConfig } from "../../src/services/aauth_attestation_trust_config.js";
import type { RevocationOutcome } from "../../src/services/aauth_attestation_revocation.js";

const EMPTY_TRUST: AttestationTrustConfig = {
  attestationRoots: [],
  webauthnAaguidAllowlist: [],
  diagnostics: [],
};

function ctx(challenge: string): AttestationContext {
  return {
    expectedChallenge: challenge,
    boundJkt: "jkt-fixture",
    trustConfig: EMPTY_TRUST,
  };
}

describe("verifyAttestation dispatcher", () => {
  it("returns not_present when envelope is null/undefined", async () => {
    const out = await verifyAttestation(null, ctx("c"));
    expect(out).toEqual({
      verified: false,
      format: "unknown",
      reason: "not_present",
    });
    const out2 = await verifyAttestation(undefined, ctx("c"));
    expect(out2.verified).toBe(false);
    expect(out2).toMatchObject({ reason: "not_present" });
  });

  it("returns malformed when envelope is not an object", async () => {
    const out = await verifyAttestation(
      "not-an-object" as unknown as AttestationEnvelope,
      ctx("c"),
    );
    expect(out).toMatchObject({
      verified: false,
      reason: "malformed",
    });
  });

  it("returns malformed when format is missing or non-string", async () => {
    for (const bad of [
      {},
      { format: 7 },
      { format: "" },
      { format: null },
    ] as AttestationEnvelope[]) {
      const out = await verifyAttestation(bad, ctx("c"));
      expect(out).toMatchObject({ verified: false, reason: "malformed" });
    }
  });

  it("returns malformed when statement is missing or non-object", async () => {
    const env: AttestationEnvelope = {
      format: "apple-secure-enclave",
      challenge: "c",
      statement: "not-an-object",
    };
    const out = await verifyAttestation(env, ctx("c"));
    expect(out).toMatchObject({
      verified: false,
      format: "apple-secure-enclave",
      reason: "malformed",
    });
  });

  it("returns malformed when challenge is missing or empty", async () => {
    const env: AttestationEnvelope = {
      format: "apple-secure-enclave",
      statement: { attestation_chain: ["a"], signature: "s" },
      challenge: "",
    };
    const out = await verifyAttestation(env, ctx("c"));
    expect(out).toMatchObject({
      verified: false,
      reason: "malformed",
    });
  });

  it("returns challenge_mismatch when envelope challenge != expected", async () => {
    const env: AttestationEnvelope = {
      format: "apple-secure-enclave",
      statement: { attestation_chain: ["a"], signature: "s" },
      challenge: "from-agent",
    };
    const out = await verifyAttestation(env, ctx("from-server"));
    expect(out).toMatchObject({
      verified: false,
      format: "apple-secure-enclave",
      reason: "challenge_mismatch",
    });
  });

  it("dispatches webauthn-packed to the verifier (malformed statement)", async () => {
    const env: AttestationEnvelope = {
      format: "webauthn-packed",
      statement: { alg: -7, sig: "s" },
      challenge: "c",
    };
    const out = await verifyAttestation(env, ctx("c"));
    expect(out).toMatchObject({
      verified: false,
      format: "webauthn-packed",
      reason: "malformed",
    });
  });

  it("dispatches tpm2 to the verifier (untrusted x5c)", async () => {
    const env: AttestationEnvelope = {
      format: "tpm2",
      statement: {
        ver: "2.0",
        alg: -7,
        x5c: ["a"],
        sig: "s",
        certInfo: "c",
        pubArea: "p",
      },
      challenge: "c",
    };
    const out = await verifyAttestation(env, ctx("c"));
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "chain_invalid",
    });
  });

  it("returns unsupported_format for unknown formats", async () => {
    const env: AttestationEnvelope = {
      format: "android-safetynet",
      statement: { foo: 1 },
      challenge: "c",
    };
    const out = await verifyAttestation(env, ctx("c"));
    expect(out).toMatchObject({
      verified: false,
      format: "unknown",
      reason: "unsupported_format",
    });
  });
});

describe("computeExpectedChallenge", () => {
  it("is stable for the same inputs", () => {
    const a = computeExpectedChallenge({
      iss: "https://issuer",
      sub: "agent:x",
      iat: 1714000000,
    });
    const b = computeExpectedChallenge({
      iss: "https://issuer",
      sub: "agent:x",
      iat: 1714000000,
    });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toContain("=");
  });

  it("changes when any input changes", () => {
    const base = computeExpectedChallenge({
      iss: "i",
      sub: "s",
      iat: 1,
    });
    expect(
      computeExpectedChallenge({ iss: "i2", sub: "s", iat: 1 }),
    ).not.toBe(base);
    expect(
      computeExpectedChallenge({ iss: "i", sub: "s2", iat: 1 }),
    ).not.toBe(base);
    expect(
      computeExpectedChallenge({ iss: "i", sub: "s", iat: 2 }),
    ).not.toBe(base);
  });

  it("coerces iat through String() (number vs string equivalence)", () => {
    const num = computeExpectedChallenge({ iss: "i", sub: "s", iat: 42 });
    const str = computeExpectedChallenge({ iss: "i", sub: "s", iat: "42" });
    expect(num).toBe(str);
  });

  it("treats null/undefined inputs as empty strings", () => {
    const undef = computeExpectedChallenge({});
    const nulls = computeExpectedChallenge({ iss: null, sub: null, iat: null });
    expect(undef).toBe(nulls);
  });
});

describe("computeBoundChallengeDigest", () => {
  it("commits to both inputs", () => {
    const base = computeBoundChallengeDigest("c", "j");
    expect(computeBoundChallengeDigest("c2", "j")).not.toEqual(base);
    expect(computeBoundChallengeDigest("c", "j2")).not.toEqual(base);
    expect(base.length).toBe(32);
  });
});

describe("applyRevocationPolicy", () => {
  const verifiedOutcome: AttestationOutcome = {
    verified: true,
    format: "tpm2",
  };
  const goodRevocation: RevocationOutcome = {
    status: "good",
    source: "ocsp",
  };
  const revokedRevocation: RevocationOutcome = {
    status: "revoked",
    source: "ocsp",
  };
  const unknownRevocation: RevocationOutcome = {
    status: "unknown",
    source: "ocsp",
    detail: "no_conclusive_response",
  };

  it("returns the outcome unchanged in disabled mode", () => {
    const out = applyRevocationPolicy(verifiedOutcome, {
      mode: "disabled",
      failOpen: true,
      revocation: revokedRevocation,
    });
    expect(out).toBe(verifiedOutcome);
    expect(out.revocation).toBeUndefined();
  });

  it("returns the outcome unchanged when revocation evidence is null", () => {
    const out = applyRevocationPolicy(verifiedOutcome, {
      mode: "log_only",
      failOpen: true,
      revocation: null,
    });
    expect(out).toBe(verifiedOutcome);
  });

  it("attaches a diagnostic in log_only mode without demoting the tier", () => {
    const out = applyRevocationPolicy(verifiedOutcome, {
      mode: "log_only",
      failOpen: true,
      revocation: revokedRevocation,
    });
    expect(out.verified).toBe(true);
    expect(out.revocation).toMatchObject({
      checked: true,
      status: "revoked",
      source: "ocsp",
      mode: "log_only",
      demoted: false,
    });
  });

  it("demotes a verified outcome to revoked in enforce mode on a revoked status", () => {
    const out = applyRevocationPolicy(verifiedOutcome, {
      mode: "enforce",
      failOpen: true,
      revocation: revokedRevocation,
    });
    expect(out.verified).toBe(false);
    if (!out.verified) {
      expect(out.format).toBe("tpm2");
      expect(out.reason).toBe("revoked");
      expect(out.revocation).toMatchObject({
        status: "revoked",
        mode: "enforce",
        demoted: true,
      });
    }
  });

  it("treats unknown as good when fail-open is true (enforce mode)", () => {
    const out = applyRevocationPolicy(verifiedOutcome, {
      mode: "enforce",
      failOpen: true,
      revocation: unknownRevocation,
    });
    expect(out.verified).toBe(true);
    expect(out.revocation).toMatchObject({
      status: "unknown",
      mode: "enforce",
      demoted: false,
    });
  });

  it("treats unknown as revoked when fail-open is false (enforce mode)", () => {
    const out = applyRevocationPolicy(verifiedOutcome, {
      mode: "enforce",
      failOpen: false,
      revocation: unknownRevocation,
    });
    expect(out.verified).toBe(false);
    if (!out.verified) {
      expect(out.reason).toBe("revoked");
      expect(out.revocation).toMatchObject({
        status: "unknown",
        mode: "enforce",
        demoted: true,
      });
    }
  });

  it("preserves an existing failure reason and never sets demoted=true on it", () => {
    const failed: AttestationOutcome = {
      verified: false,
      format: "tpm2",
      reason: "signature_invalid",
    };
    const out = applyRevocationPolicy(failed, {
      mode: "enforce",
      failOpen: false,
      revocation: revokedRevocation,
    });
    expect(out.verified).toBe(false);
    if (!out.verified) {
      expect(out.reason).toBe("signature_invalid");
      expect(out.revocation).toMatchObject({
        status: "revoked",
        demoted: false,
      });
    }
  });

  it("attaches a good-status diagnostic without demoting", () => {
    const out = applyRevocationPolicy(verifiedOutcome, {
      mode: "enforce",
      failOpen: true,
      revocation: goodRevocation,
    });
    expect(out.verified).toBe(true);
    expect(out.revocation).toMatchObject({
      status: "good",
      demoted: false,
    });
  });
});
