/**
 * Unit tests for `src/services/protected_entity_types.ts`.
 *
 * The protected-entity-types guard sits between the structured-store
 * write path and the durable observation insert sites. It enforces:
 *
 * 1. User-authenticated callers (no AAuth identity at all) pass through
 *    unconditionally.
 * 2. AAuth-admitted callers must hold an explicit capability that
 *    covers `(op, protected_entity_type)` on their resolved grant.
 * 3. AAuth-verified-but-unadmitted callers cannot mutate governance
 *    state — even if the rest of the system would let them through.
 * 4. The protected-types registry currently lists `agent_grant` and
 *    nothing else.
 */

import { describe, expect, it } from "vitest";
import {
  AAuthAdmissionContext,
  assertCanWriteProtected,
  assertCanWriteProtectedBatch,
  getProtectedEntityTypes,
  isProtected,
} from "../../src/services/protected_entity_types.js";
import { AgentCapabilityError } from "../../src/services/agent_capabilities.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";

const SIGNED_IDENT = createAgentIdentity({
  publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
  thumbprint: "tp-test",
  algorithm: "ES256",
  sub: "agent-test@example.com",
  iss: "https://agent.example.com",
});

const ADMITTED_WITH_GRANT_CAP: AAuthAdmissionContext = {
  admitted: true,
  user_id: "usr_owner",
  grant_id: "ent_grant_1",
  agent_label: "test-grant",
  capabilities: [
    { op: "store_structured", entity_types: ["agent_grant"] },
    { op: "correct", entity_types: ["agent_grant"] },
  ],
  reason: "admitted",
};

const ADMITTED_WITHOUT_GRANT_CAP: AAuthAdmissionContext = {
  admitted: true,
  user_id: "usr_owner",
  grant_id: "ent_grant_2",
  agent_label: "feedback-grant",
  capabilities: [
    { op: "store_structured", entity_types: ["neotoma_feedback"] },
  ],
  reason: "admitted",
};

const ADMITTED_WILDCARD: AAuthAdmissionContext = {
  admitted: true,
  user_id: "usr_owner",
  grant_id: "ent_grant_wild",
  agent_label: "wildcard-grant",
  capabilities: [{ op: "store_structured", entity_types: ["*"] }],
  reason: "admitted",
};

const NOT_ADMITTED_BUT_VERIFIED: AAuthAdmissionContext = {
  admitted: false,
  reason: "no_match",
};

describe("isProtected / getProtectedEntityTypes", () => {
  it("flags agent_grant as protected", () => {
    expect(isProtected("agent_grant")).toBe(true);
  });

  it("does not flag ordinary entity types", () => {
    expect(isProtected("task")).toBe(false);
    expect(isProtected("transaction")).toBe(false);
    expect(isProtected("neotoma_feedback")).toBe(false);
  });

  it("returns the canonical sorted list of protected types", () => {
    const list = getProtectedEntityTypes();
    expect(list).toEqual(["agent_grant"]);
  });
});

describe("assertCanWriteProtected", () => {
  it("no-ops on unprotected entity types", () => {
    expect(() =>
      assertCanWriteProtected({
        entity_type: "task",
        op: "store_structured",
        identity: SIGNED_IDENT,
        admission: NOT_ADMITTED_BUT_VERIFIED,
      }),
    ).not.toThrow();
  });

  it("allows user-authenticated callers (no agent identity at all)", () => {
    expect(() =>
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "store_structured",
        identity: null,
        admission: null,
      }),
    ).not.toThrow();
  });

  it("allows admitted agents whose grant covers the protected type", () => {
    expect(() =>
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "store_structured",
        identity: SIGNED_IDENT,
        admission: ADMITTED_WITH_GRANT_CAP,
      }),
    ).not.toThrow();
    expect(() =>
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "correct",
        identity: SIGNED_IDENT,
        admission: ADMITTED_WITH_GRANT_CAP,
      }),
    ).not.toThrow();
  });

  it("allows admitted agents whose grant uses wildcard entity_types", () => {
    expect(() =>
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "store_structured",
        identity: SIGNED_IDENT,
        admission: ADMITTED_WILDCARD,
      }),
    ).not.toThrow();
  });

  it("denies admitted agents whose grant does NOT cover the protected type", () => {
    try {
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "store_structured",
        identity: SIGNED_IDENT,
        admission: ADMITTED_WITHOUT_GRANT_CAP,
      });
      throw new Error("expected capability_denied");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentCapabilityError);
      const cap = err as AgentCapabilityError;
      expect(cap.code).toBe("capability_denied");
      expect(cap.entityType).toBe("agent_grant");
      expect(cap.hint).toContain("Inspector → Agents → Grants");
    }
  });

  it("denies admitted agents who hold the wrong op for the protected type", () => {
    try {
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "correct",
        identity: SIGNED_IDENT,
        // grant only has store_structured for agent_grant.
        admission: {
          ...ADMITTED_WITH_GRANT_CAP,
          capabilities: [
            { op: "store_structured", entity_types: ["agent_grant"] },
          ],
        },
      });
      throw new Error("expected capability_denied");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentCapabilityError);
      expect((err as AgentCapabilityError).op).toBe("correct");
    }
  });

  it("denies AAuth-verified-but-unadmitted callers", () => {
    try {
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "store_structured",
        identity: SIGNED_IDENT,
        admission: NOT_ADMITTED_BUT_VERIFIED,
      });
      throw new Error("expected capability_denied");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentCapabilityError);
      expect((err as AgentCapabilityError).hint).toContain(
        "create a grant in Inspector",
      );
    }
  });

  it("denies callers who only present a clientInfo identity (no AAuth)", () => {
    const clientInfoIdent = createAgentIdentity({
      clientName: "claude-code",
      clientVersion: "1.0",
    });
    try {
      assertCanWriteProtected({
        entity_type: "agent_grant",
        op: "store_structured",
        identity: clientInfoIdent,
        admission: null,
      });
      throw new Error("expected capability_denied");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentCapabilityError);
    }
  });
});

describe("assertCanWriteProtectedBatch", () => {
  it("no-ops on an empty batch", () => {
    expect(() =>
      assertCanWriteProtectedBatch({
        entity_types: [],
        op: "store_structured",
        identity: SIGNED_IDENT,
        admission: ADMITTED_WITHOUT_GRANT_CAP,
      }),
    ).not.toThrow();
  });

  it("dedupes repeated entity types", () => {
    expect(() =>
      assertCanWriteProtectedBatch({
        entity_types: ["task", "task"],
        op: "store_structured",
        identity: null,
        admission: null,
      }),
    ).not.toThrow();
  });

  it("throws on the first protected type that fails", () => {
    expect(() =>
      assertCanWriteProtectedBatch({
        entity_types: ["task", "agent_grant", "transaction"],
        op: "store_structured",
        identity: SIGNED_IDENT,
        admission: ADMITTED_WITHOUT_GRANT_CAP,
      }),
    ).toThrow(AgentCapabilityError);
  });

  it("ignores empty / falsy entries in the batch", () => {
    expect(() =>
      assertCanWriteProtectedBatch({
        entity_types: ["", "task", ""],
        op: "store_structured",
        identity: null,
        admission: null,
      }),
    ).not.toThrow();
  });
});
