/**
 * Pin the {@link tierIcon} mapping for `AgentBadge`.
 *
 * Inspector ships five trust tiers (`hardware`, `operator_attested`,
 * `software`, `unverified_client`, `anonymous`). Each MUST render a
 * distinct glyph so dense tables remain scannable; this is also the
 * regression test for the FU-1 v0.8.0 bug where `operator_attested`
 * silently fell through to the `anonymous` glyph.
 */

import { describe, expect, it } from "vitest";
import {
  extractAgentAttribution,
  tierIcon,
} from "../../../../inspector/src/components/shared/agent_badge";

describe("tierIcon", () => {
  it("returns a distinct glyph for each tier", () => {
    const mapping = {
      hardware: tierIcon("hardware"),
      operator_attested: tierIcon("operator_attested"),
      software: tierIcon("software"),
      unverified_client: tierIcon("unverified_client"),
      anonymous: tierIcon("anonymous"),
    };
    const glyphs = Object.values(mapping);
    const unique = new Set(glyphs);
    expect(unique.size).toBe(glyphs.length);
  });

  it("maps `operator_attested` to a non-anonymous glyph (regression)", () => {
    expect(tierIcon("operator_attested")).not.toBe(tierIcon("anonymous"));
  });

  it("maps `hardware` to its own glyph", () => {
    expect(tierIcon("hardware")).not.toBe(tierIcon("software"));
    expect(tierIcon("hardware")).not.toBe(tierIcon("operator_attested"));
  });
});

describe("extractAgentAttribution", () => {
  it("returns null for empty / missing provenance", () => {
    expect(extractAgentAttribution(null)).toBeNull();
    expect(extractAgentAttribution(undefined)).toBeNull();
    expect(extractAgentAttribution({})).toBeNull();
  });

  it("reads core attribution fields off a provenance blob", () => {
    const result = extractAgentAttribution({
      agent_thumbprint: "tp-abc",
      agent_algorithm: "ES256",
      attribution_tier: "software",
      client_name: "cursor-agent",
    });
    expect(result?.agent_thumbprint).toBe("tp-abc");
    expect(result?.agent_algorithm).toBe("ES256");
    expect(result?.attribution_tier).toBe("software");
    expect(result?.client_name).toBe("cursor-agent");
    expect(result?.attestation).toBeNull();
    expect(result?.operator_allowlist_source).toBeNull();
  });

  it("extracts attestation outcome when present", () => {
    const result = extractAgentAttribution({
      agent_thumbprint: "tp-abc",
      attribution_tier: "hardware",
      attestation: {
        verified: true,
        format: "apple-secure-enclave",
        aaguid: "00000000-0000-0000-0000-000000000000",
        key_binding_matches_cnf_jwk: true,
        challenge_digest: "abcdef0123456789",
        chain: [{ subject_cn: "Apple App Attestation Leaf" }],
      },
    });
    expect(result?.attestation?.verified).toBe(true);
    expect(result?.attestation?.format).toBe("apple-secure-enclave");
    expect(result?.attestation?.key_binding_matches_cnf_jwk).toBe(true);
    expect(result?.attestation?.chain?.length).toBe(1);
  });

  it("rejects malformed attestation blobs without throwing", () => {
    const result = extractAgentAttribution({
      agent_thumbprint: "tp-abc",
      attribution_tier: "software",
      attestation: { verified: "yes-please" },
    });
    expect(result?.attestation).toBeNull();
  });

  it("normalises operator_allowlist_source to a known enum or null", () => {
    expect(
      extractAgentAttribution({
        attribution_tier: "operator_attested",
        operator_allowlist_source: "issuer_subject",
      })?.operator_allowlist_source
    ).toBe("issuer_subject");
    expect(
      extractAgentAttribution({
        attribution_tier: "operator_attested",
        operator_allowlist_source: "garbage",
      })?.operator_allowlist_source
    ).toBeNull();
  });
});
