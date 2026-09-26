/**
 * Unit tests for `src/services/agent_grants.ts` covering the pure
 * (no-DB) parts of the grants domain layer:
 *
 *   - `validateCapabilities` — capability-shape validation
 *   - validation surface around grant drafts (label, identity match,
 *     status transitions) via the exported error classes
 *   - the in-memory cache invalidation primitives so admission picks
 *     up revocation across processes within at most one TTL cycle.
 *
 * DB-backed flows (create, list, setStatus, recordMatch) are exercised
 * end-to-end in `tests/integration/agent_grants_routes.test.ts` and
 * `tests/integration/aauth_admission.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentGrantStatusTransitionError,
  AgentGrantValidationError,
  assertAgentGrantFieldValid,
  clearGrantCacheForTests,
  clearMatchDebounceForTests,
  invalidateGrantCache,
  validateCapabilities,
  type AgentGrant,
} from "../../src/services/agent_grants.js";

beforeEach(() => {
  clearGrantCacheForTests();
  clearMatchDebounceForTests();
});

afterEach(() => {
  clearGrantCacheForTests();
  clearMatchDebounceForTests();
});

describe("validateCapabilities", () => {
  it("returns an empty array when given undefined or null", () => {
    expect(validateCapabilities(undefined)).toEqual([]);
    expect(validateCapabilities(null)).toEqual([]);
  });

  it("rejects a non-array top-level value", () => {
    expect(() => validateCapabilities({})).toThrow(AgentGrantValidationError);
    expect(() => validateCapabilities("oops")).toThrow(AgentGrantValidationError);
  });

  it("rejects an entry that is not an object", () => {
    expect(() => validateCapabilities(["foo"])).toThrow(AgentGrantValidationError);
  });

  it("rejects an unknown op", () => {
    try {
      validateCapabilities([{ op: "teleport", entity_types: ["x"] }]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentGrantValidationError);
      expect((err as AgentGrantValidationError).field).toBe("capabilities[0].op");
    }
  });

  it("requires a non-empty entity_types array", () => {
    try {
      validateCapabilities([{ op: "store_structured", entity_types: [] }]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentGrantValidationError);
      expect((err as AgentGrantValidationError).field).toBe("capabilities[0].entity_types");
    }
  });

  it("rejects non-string / blank entity_types entries", () => {
    expect(() => validateCapabilities([{ op: "store_structured", entity_types: [1] }])).toThrow(
      AgentGrantValidationError
    );
    expect(() => validateCapabilities([{ op: "store_structured", entity_types: ["   "] }])).toThrow(
      AgentGrantValidationError
    );
  });

  it("normalises and dedupes entity_types per entry", () => {
    const out = validateCapabilities([
      {
        op: "store_structured",
        entity_types: ["  task  ", "task", "transaction"],
      },
    ]);
    expect(out).toEqual([{ op: "store_structured", entity_types: ["task", "transaction"] }]);
  });

  it("preserves all four canonical ops", () => {
    const out = validateCapabilities([
      { op: "store_structured", entity_types: ["x"] },
      { op: "create_relationship", entity_types: ["x"] },
      { op: "correct", entity_types: ["x"] },
      { op: "retrieve", entity_types: ["x"] },
    ]);
    expect(out.map((c) => c.op)).toEqual([
      "store_structured",
      "create_relationship",
      "correct",
      "retrieve",
    ]);
  });

  it("preserves wildcard entity_types", () => {
    const out = validateCapabilities([{ op: "retrieve", entity_types: ["*"] }]);
    expect(out).toEqual([{ op: "retrieve", entity_types: ["*"] }]);
  });
});

describe("validateCapabilities — register_relationship_type (ateles#925)", () => {
  // ateles#925 (operator ruling, 2026-09-18): the grant tuple widens with an
  // OPTIONAL, PARALLEL relationship_types[] field. register_relationship_type
  // is keyed on relationship_types, not entity_types — a capability that
  // grants only relationship-type registration legitimately carries empty
  // (or absent) entity_types. enforceRelationshipTypeCapability's own denial
  // hint already tells callers to write `entity_types: []` alongside
  // relationship_types; before this fix, validateCapabilities rejected
  // exactly that shape, so the hint told callers to write something the
  // validator then refused on the next write.

  it("accepts entity_types: [] when relationship_types is non-empty", () => {
    const out = validateCapabilities([
      {
        op: "register_relationship_type",
        entity_types: [],
        relationship_types: ["GOVERNS"],
      },
    ]);
    expect(out).toEqual([
      {
        op: "register_relationship_type",
        entity_types: [],
        relationship_types: ["GOVERNS"],
      },
    ]);
  });

  it("accepts entity_types omitted entirely when relationship_types is non-empty", () => {
    const out = validateCapabilities([
      { op: "register_relationship_type", relationship_types: ["GOVERNS", "global"] },
    ]);
    expect(out).toEqual([
      {
        op: "register_relationship_type",
        entity_types: [],
        relationship_types: ["GOVERNS", "global"],
      },
    ]);
  });

  it("THE FIX: relationship_types survives the rebuild (was silently dropped)", () => {
    // Before the fix, `validated` was built with only { op, entity_types,
    // repos } — relationship_types never made it into the rebuilt object,
    // so no grant could ever exercise register_relationship_type once its
    // capabilities round-tripped through this function (every create,
    // update, and read does). This is the regression test for that.
    const out = validateCapabilities([
      {
        op: "register_relationship_type",
        entity_types: ["agent_policy"],
        relationship_types: ["GOVERNS", "global"],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].relationship_types).toEqual(["GOVERNS", "global"]);
  });

  it("rejects a register_relationship_type entry with no relationship_types", () => {
    try {
      validateCapabilities([{ op: "register_relationship_type", entity_types: ["agent_policy"] }]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentGrantValidationError);
      expect((err as AgentGrantValidationError).field).toBe("capabilities[0].relationship_types");
    }
  });

  it("rejects an empty relationship_types array", () => {
    expect(() =>
      validateCapabilities([{ op: "register_relationship_type", relationship_types: [] }])
    ).toThrow(AgentGrantValidationError);
  });

  it("rejects non-string / blank relationship_types entries", () => {
    expect(() =>
      validateCapabilities([{ op: "register_relationship_type", relationship_types: [1] }])
    ).toThrow(AgentGrantValidationError);
    expect(() =>
      validateCapabilities([{ op: "register_relationship_type", relationship_types: ["  "] }])
    ).toThrow(AgentGrantValidationError);
  });

  it("normalises and dedupes relationship_types", () => {
    const out = validateCapabilities([
      {
        op: "register_relationship_type",
        relationship_types: ["  GOVERNS  ", "GOVERNS", "global"],
      },
    ]);
    expect(out[0].relationship_types).toEqual(["GOVERNS", "global"]);
  });

  it("rejects a non-array entity_types when present on register_relationship_type", () => {
    expect(() =>
      validateCapabilities([
        {
          op: "register_relationship_type",
          entity_types: "agent_policy",
          relationship_types: ["GOVERNS"],
        },
      ])
    ).toThrow(AgentGrantValidationError);
  });

  it("does not leak relationship_types onto a non-relationship-type op", () => {
    // A store_structured entry that happens to carry a relationship_types
    // key (e.g. copy-paste from a register_relationship_type entry) must
    // not have it survive into the validated output — it has no meaning
    // for that op and entryCovers/enforceAgentCapability never reads it.
    const out = validateCapabilities([
      {
        op: "store_structured",
        entity_types: ["task"],
        relationship_types: ["GOVERNS"],
      },
    ]);
    expect(out).toEqual([{ op: "store_structured", entity_types: ["task"] }]);
  });
});

describe("error classes", () => {
  it("AgentGrantValidationError carries a 400 status", () => {
    const err = new AgentGrantValidationError("missing label", "label");
    expect(err.code).toBe("agent_grant_invalid");
    expect(err.statusCode).toBe(400);
    expect(err.field).toBe("label");
  });

  it("AgentGrantStatusTransitionError surfaces from/to", () => {
    const err = new AgentGrantStatusTransitionError("revoked", "suspended");
    expect(err.code).toBe("agent_grant_status_transition");
    expect(err.statusCode).toBe(409);
    expect(err.from).toBe("revoked");
    expect(err.to).toBe("suspended");
  });
});

describe("invalidateGrantCache", () => {
  // The cache is keyed by identity (sub / iss / thumbprint). We can
  // exercise the invalidation primitive without standing up a DB by
  // hand-rolling a grant with the persisted shape.
  const stub: AgentGrant = {
    grant_id: "ent_grant_test",
    user_id: "usr_test",
    label: "test",
    match_sub: "agent-test@example.com",
    match_iss: "https://agent.example.com",
    match_thumbprint: "tp-test",
    capabilities: [],
    status: "active",
    notes: null,
    last_used_at: null,
    import_source: null,
  };

  it("clears every cache key when called without a grant", () => {
    expect(() => invalidateGrantCache()).not.toThrow();
  });

  it("clears the keys for a specific grant", () => {
    expect(() => invalidateGrantCache(stub)).not.toThrow();
  });
});

describe("assertAgentGrantFieldValid — pre-persist guard", () => {
  // This is the single check createObservation (store/store_structured,
  // both transports) and createCorrection (correct, both transports) call
  // before any agent_grant row is written — the gap createGrant /
  // updateGrantFields alone left open, since a raw correct() or
  // store_structured targeting entity_type: "agent_grant" bypasses those
  // CRUD helpers entirely. See both call sites' comments for why this is
  // the deepest common choke point.

  it("is a no-op for any entity_type other than agent_grant", () => {
    expect(() => assertAgentGrantFieldValid("task", "capabilities", "not-an-array")).not.toThrow();
    expect(() => assertAgentGrantFieldValid("contact", "status", "not-a-status")).not.toThrow();
  });

  it("is a no-op for an agent_grant field it does not recognise", () => {
    expect(() => assertAgentGrantFieldValid("agent_grant", "notes", 12345)).not.toThrow();
  });

  it("rejects invalid agent_grant capabilities before persistence", () => {
    expect(() => assertAgentGrantFieldValid("agent_grant", "capabilities", "not-an-array")).toThrow(
      AgentGrantValidationError
    );
    expect(() =>
      assertAgentGrantFieldValid("agent_grant", "capabilities", [
        { op: "store_structured", entity_types: [] },
      ])
    ).toThrow(AgentGrantValidationError);
  });

  it("accepts valid agent_grant capabilities, including register_relationship_type", () => {
    expect(() =>
      assertAgentGrantFieldValid("agent_grant", "capabilities", [
        { op: "store_structured", entity_types: ["task"] },
        {
          op: "register_relationship_type",
          entity_types: [],
          relationship_types: ["GOVERNS"],
        },
      ])
    ).not.toThrow();
  });

  it("rejects an invalid agent_grant status before persistence", () => {
    expect(() => assertAgentGrantFieldValid("agent_grant", "status", "disabled")).toThrow(
      AgentGrantValidationError
    );
  });

  it("rejects an empty agent_grant label before persistence", () => {
    expect(() => assertAgentGrantFieldValid("agent_grant", "label", "   ")).toThrow(
      AgentGrantValidationError
    );
  });
});
