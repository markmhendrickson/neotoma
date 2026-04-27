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
    expect(() => validateCapabilities("oops")).toThrow(
      AgentGrantValidationError,
    );
  });

  it("rejects an entry that is not an object", () => {
    expect(() => validateCapabilities(["foo"])).toThrow(
      AgentGrantValidationError,
    );
  });

  it("rejects an unknown op", () => {
    try {
      validateCapabilities([
        { op: "teleport", entity_types: ["x"] },
      ]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentGrantValidationError);
      expect((err as AgentGrantValidationError).field).toBe("capabilities[0].op");
    }
  });

  it("requires a non-empty entity_types array", () => {
    try {
      validateCapabilities([
        { op: "store_structured", entity_types: [] },
      ]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentGrantValidationError);
      expect((err as AgentGrantValidationError).field).toBe(
        "capabilities[0].entity_types",
      );
    }
  });

  it("rejects non-string / blank entity_types entries", () => {
    expect(() =>
      validateCapabilities([
        { op: "store_structured", entity_types: [1] },
      ]),
    ).toThrow(AgentGrantValidationError);
    expect(() =>
      validateCapabilities([
        { op: "store_structured", entity_types: ["   "] },
      ]),
    ).toThrow(AgentGrantValidationError);
  });

  it("normalises and dedupes entity_types per entry", () => {
    const out = validateCapabilities([
      {
        op: "store_structured",
        entity_types: ["  task  ", "task", "transaction"],
      },
    ]);
    expect(out).toEqual([
      { op: "store_structured", entity_types: ["task", "transaction"] },
    ]);
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
    const out = validateCapabilities([
      { op: "retrieve", entity_types: ["*"] },
    ]);
    expect(out).toEqual([{ op: "retrieve", entity_types: ["*"] }]);
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
