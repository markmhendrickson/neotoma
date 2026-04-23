/**
 * Unit tests for `src/crypto/agent_identity.ts` (Phase 1.7).
 *
 * Focuses on the pure helpers — tier derivation, generic-name filtering,
 * and provenance merging — that the middleware and write-path services
 * depend on. Keeps fast feedback on the attribution contract without
 * booting an MCP server.
 */

import { describe, expect, it } from "vitest";
import {
  algorithmLooksHardwareBacked,
  createAgentIdentity,
  deriveAttributionTier,
  getAgentIdentityFromRequest,
  mergeAttributionIntoProvenance,
  normaliseClientName,
  toAttributionProvenance,
  validateAgentIdentity,
} from "../../src/crypto/agent_identity.js";

describe("algorithmLooksHardwareBacked", () => {
  it("returns true for ES256 and EdDSA (case-insensitive)", () => {
    expect(algorithmLooksHardwareBacked("ES256")).toBe(true);
    expect(algorithmLooksHardwareBacked("es256")).toBe(true);
    expect(algorithmLooksHardwareBacked("EdDSA")).toBe(true);
    expect(algorithmLooksHardwareBacked("EDDSA")).toBe(true);
  });

  it("returns false for other algorithms and empty input", () => {
    expect(algorithmLooksHardwareBacked("RS256")).toBe(false);
    expect(algorithmLooksHardwareBacked("HS256")).toBe(false);
    expect(algorithmLooksHardwareBacked(undefined)).toBe(false);
    expect(algorithmLooksHardwareBacked("")).toBe(false);
  });
});

describe("normaliseClientName", () => {
  it("filters generic / empty values", () => {
    expect(normaliseClientName("mcp")).toBeUndefined();
    expect(normaliseClientName(" Client ")).toBeUndefined();
    expect(normaliseClientName("unknown")).toBeUndefined();
    expect(normaliseClientName("")).toBeUndefined();
    expect(normaliseClientName("   ")).toBeUndefined();
    expect(normaliseClientName(null)).toBeUndefined();
    expect(normaliseClientName(undefined)).toBeUndefined();
  });

  it("passes through real names and trims whitespace", () => {
    expect(normaliseClientName("Claude Code")).toBe("Claude Code");
    expect(normaliseClientName("  Cursor  ")).toBe("Cursor");
    expect(normaliseClientName("neotoma-cli/0.5.1")).toBe("neotoma-cli/0.5.1");
  });
});

describe("deriveAttributionTier", () => {
  it("returns 'hardware' when AAuth verified with ES256/EdDSA", () => {
    expect(
      deriveAttributionTier({
        publicKey: "{}",
        thumbprint: "tp",
        algorithm: "ES256",
      })
    ).toBe("hardware");
    expect(
      deriveAttributionTier({
        publicKey: "{}",
        thumbprint: "tp",
        algorithm: "EdDSA",
      })
    ).toBe("hardware");
  });

  it("returns 'software' when AAuth verified with non-hardware alg", () => {
    expect(
      deriveAttributionTier({
        publicKey: "{}",
        thumbprint: "tp",
        algorithm: "RS256",
      })
    ).toBe("software");
  });

  it("returns 'unverified_client' when only clientName is present", () => {
    expect(deriveAttributionTier({ clientName: "Claude" })).toBe(
      "unverified_client"
    );
  });

  it("returns 'anonymous' when nothing is known", () => {
    expect(deriveAttributionTier({})).toBe("anonymous");
  });
});

describe("toAttributionProvenance", () => {
  it("returns empty object for null identity", () => {
    expect(toAttributionProvenance(null)).toEqual({});
    expect(toAttributionProvenance(undefined)).toEqual({});
  });

  it("serialises all known fields and stamps attributed_at", () => {
    const prov = toAttributionProvenance({
      publicKey: "pk",
      thumbprint: "tp",
      algorithm: "ES256",
      sub: "agent:x",
      iss: "https://iss",
      clientName: "Claude",
      clientVersion: "1.0",
      connectionId: "conn-1",
      tier: "hardware",
    });
    expect(prov.agent_public_key).toBe("pk");
    expect(prov.agent_thumbprint).toBe("tp");
    expect(prov.agent_algorithm).toBe("ES256");
    expect(prov.agent_sub).toBe("agent:x");
    expect(prov.agent_iss).toBe("https://iss");
    expect(prov.client_name).toBe("Claude");
    expect(prov.client_version).toBe("1.0");
    expect(prov.connection_id).toBe("conn-1");
    expect(prov.attribution_tier).toBe("hardware");
    expect(prov.attributed_at).toBeTypeOf("string");
    expect(() => new Date(prov.attributed_at as string).toISOString()).not.toThrow();
  });

  it("omits keys when underlying fields are absent", () => {
    const prov = toAttributionProvenance({ tier: "anonymous" });
    expect(prov).toEqual({
      attribution_tier: "anonymous",
      attributed_at: expect.any(String),
    });
  });
});

describe("mergeAttributionIntoProvenance", () => {
  it("merges into an empty base", () => {
    const merged = mergeAttributionIntoProvenance(null, {
      attribution_tier: "software",
      agent_thumbprint: "tp",
    });
    expect(merged).toEqual({
      attribution_tier: "software",
      agent_thumbprint: "tp",
    });
  });

  it("preserves existing non-attribution keys", () => {
    const merged = mergeAttributionIntoProvenance(
      { source: "test", revision: 7 },
      { attribution_tier: "hardware" }
    );
    expect(merged).toEqual({
      source: "test",
      revision: 7,
      attribution_tier: "hardware",
    });
  });

  it("parses existing JSON string bases", () => {
    const merged = mergeAttributionIntoProvenance(
      JSON.stringify({ note: "hi" }),
      { attribution_tier: "anonymous" }
    );
    expect(merged).toEqual({ note: "hi", attribution_tier: "anonymous" });
  });

  it("swallows malformed JSON instead of throwing", () => {
    const merged = mergeAttributionIntoProvenance("{not json", {
      attribution_tier: "anonymous",
    });
    expect(merged).toEqual({ attribution_tier: "anonymous" });
  });

  it("returns base untouched when attribution is empty", () => {
    const merged = mergeAttributionIntoProvenance({ a: 1 }, {});
    expect(merged).toEqual({ a: 1 });
  });
});

describe("createAgentIdentity + validateAgentIdentity", () => {
  it("assigns a derived tier when not supplied", () => {
    const id = createAgentIdentity({ clientName: "Claude" });
    expect(id.tier).toBe("unverified_client");
    expect(validateAgentIdentity(id)).toBe(true);
  });

  it("respects an explicit tier", () => {
    const id = createAgentIdentity({ tier: "anonymous" });
    expect(id.tier).toBe("anonymous");
  });

  it("validates required shape", () => {
    expect(validateAgentIdentity(null as never)).toBe(false);
    expect(validateAgentIdentity({ tier: "nope" } as never)).toBe(false);
    expect(
      validateAgentIdentity({ tier: "anonymous", publicKey: "" } as never)
    ).toBe(false);
  });
});

describe("getAgentIdentityFromRequest", () => {
  it("returns null when request has no attribution", () => {
    const req = { headers: {} } as any;
    expect(getAgentIdentityFromRequest(req)).toBeNull();
  });

  it("builds software-tier identity from AAuth context alone", () => {
    const req = {
      headers: {},
      aauth: {
        verified: true,
        publicKey: "pk",
        thumbprint: "tp",
        algorithm: "RS256",
        sub: "agent:x",
      },
    } as any;
    const id = getAgentIdentityFromRequest(req);
    expect(id).not.toBeNull();
    expect(id!.tier).toBe("software");
    expect(id!.thumbprint).toBe("tp");
  });

  it("falls back to clientInfo when AAuth is absent", () => {
    const req = { headers: {} } as any;
    const id = getAgentIdentityFromRequest(req, {
      clientName: "Cursor",
      clientVersion: "0.50",
    });
    expect(id).not.toBeNull();
    expect(id!.tier).toBe("unverified_client");
    expect(id!.clientName).toBe("Cursor");
  });

  it("filters generic clientInfo and returns null when only generic", () => {
    const req = { headers: {} } as any;
    const id = getAgentIdentityFromRequest(req, { clientName: "mcp" });
    expect(id).toBeNull();
  });
});
