/**
 * End-to-end enforcement test for `override_policy` on `agent_definition`
 * entities (#1634, re-derived from #398).
 *
 * Exercises the REAL write path — `createObservation` / `createCorrection`
 * with the request-scoped agent identity — against a live local DB with a
 * seeded `entity_snapshots` row. This is the test the original branch lacked:
 * it fails if the snapshot lookup silently no-ops (the `.maybeSingle()` bug)
 * or if enforcement is skipped for any other reason.
 *
 * Matrix:
 *  - operator identity (null / hardware tier) → write allowed
 *  - service identity (software tier)         → denied field throws
 *    OverridePolicyViolationError with code/statusCode/envelope
 *  - unlisted field                           → allowed for any role
 *  - cross-tenant: a policy row owned by ANOTHER user must NOT be consulted
 *    for this user's write (tenant-scoped snapshot lookup)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { createCorrection } from "../../src/services/correction.js";
import { OverridePolicyViolationError } from "../../src/services/override_validation.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import type { AgentIdentity } from "../../src/crypto/agent_identity.js";

const USER_A = "00000000-0000-0000-0000-00000000aaa1";
const USER_B = "00000000-0000-0000-0000-00000000bbb2";
const ENTITY_ID = "ent_override_policy_e2e_test";
const CROSS_TENANT_ENTITY_ID = "ent_override_policy_xtenant_test";

const DENY_SERVICE_POLICY = JSON.stringify({
  field_policies: {
    agent_grant: {
      allowed_roles: ["operator"],
      deny_message: "Only operators may change agent_grant",
    },
  },
});

const OPERATOR_IDENTITY: AgentIdentity | null = null; // no identity → operator

const SERVICE_IDENTITY: AgentIdentity = {
  tier: "software",
  sub: "ci-service@example.com",
  algorithm: "ES256",
};

function seedSnapshot(entityId: string, userId: string, overridePolicy: string) {
  return db.from("entity_snapshots").insert({
    entity_id: entityId,
    entity_type: "agent_definition",
    schema_version: "1.0",
    canonical_name: entityId,
    snapshot: { agent_grant: "initial", override_policy: overridePolicy },
    computed_at: new Date().toISOString(),
    observation_count: 1,
    last_observation_at: new Date().toISOString(),
    provenance: {},
    user_id: userId,
  });
}

function observationParams(userId: string, fields: Record<string, unknown>) {
  return {
    entity_id: ENTITY_ID,
    entity_type: "agent_definition",
    schema_version: "1.0",
    source_id: null,
    interpretation_id: null,
    observed_at: new Date().toISOString(),
    specificity_score: 1,
    source_priority: 500,
    fields,
    user_id: userId,
    idempotency_key: `override-e2e-${Math.random().toString(36).slice(2)}`,
  };
}

async function cleanup() {
  for (const table of ["observations", "entity_snapshots", "entities"]) {
    for (const id of [ENTITY_ID, CROSS_TENANT_ENTITY_ID]) {
      await db
        .from(table)
        .delete()
        .eq(table === "observations" ? "entity_id" : table === "entities" ? "id" : "entity_id", id);
    }
  }
}

describe("override_policy end-to-end enforcement (agent_definition)", () => {
  beforeAll(async () => {
    await cleanup();
    await seedSnapshot(ENTITY_ID, USER_A, DENY_SERVICE_POLICY);
    // Cross-tenant probe: USER_B owns a deny-everything policy under a
    // DIFFERENT entity id; USER_A's write to that id must not see it.
    await seedSnapshot(CROSS_TENANT_ENTITY_ID, USER_B, DENY_SERVICE_POLICY);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("denies a service-identity observation write to a protected field", async () => {
    let caught: unknown;
    try {
      await runWithRequestContext({ agentIdentity: SERVICE_IDENTITY }, () =>
        createObservation(observationParams(USER_A, { agent_grant: "escalated" }))
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OverridePolicyViolationError);
    const violation = caught as OverridePolicyViolationError;
    expect(violation.code).toBe("OVERRIDE_POLICY_VIOLATION");
    expect(violation.statusCode).toBe(403);
    const envelope = violation.toErrorEnvelope();
    expect(envelope).toMatchObject({
      code: "OVERRIDE_POLICY_VIOLATION",
      field_name: "agent_grant",
      entity_id: ENTITY_ID,
    });
    expect(envelope.agent_role).toBe("service");
    expect(envelope.message).toContain("agent_grant");
  });

  it("denies a service-identity correction to a protected field", async () => {
    await expect(
      runWithRequestContext({ agentIdentity: SERVICE_IDENTITY }, () =>
        createCorrection({
          entity_id: ENTITY_ID,
          entity_type: "agent_definition",
          field: "agent_grant",
          value: "escalated",
          schema_version: "1.0",
          user_id: USER_A,
        })
      )
    ).rejects.toBeInstanceOf(OverridePolicyViolationError);
  });

  it("allows an operator (no identity) to write the protected field", async () => {
    const record = await runWithRequestContext({ agentIdentity: OPERATOR_IDENTITY }, () =>
      createObservation(observationParams(USER_A, { agent_grant: "rotated-by-operator" }))
    );
    expect(record.entity_id).toBe(ENTITY_ID);
    expect(record.fields.agent_grant).toBe("rotated-by-operator");
  });

  it("allows a service identity to write an unlisted field", async () => {
    const record = await runWithRequestContext({ agentIdentity: SERVICE_IDENTITY }, () =>
      createObservation(observationParams(USER_A, { description: "harmless metadata edit" }))
    );
    expect(record.entity_id).toBe(ENTITY_ID);
  });

  it("does not consult another tenant's policy row (user-scoped lookup)", async () => {
    // USER_A writes to the entity id whose ONLY policy row belongs to USER_B.
    // The lookup is scoped to USER_A → no snapshot → fail-open → allowed.
    const record = await runWithRequestContext({ agentIdentity: SERVICE_IDENTITY }, () =>
      createObservation({
        ...observationParams(USER_A, { agent_grant: "cross-tenant-probe" }),
        entity_id: CROSS_TENANT_ENTITY_ID,
      })
    );
    expect(record.entity_id).toBe(CROSS_TENANT_ENTITY_ID);
  });

  it("ignores entity types other than agent_definition", async () => {
    const record = await runWithRequestContext({ agentIdentity: SERVICE_IDENTITY }, () =>
      createObservation({
        ...observationParams(USER_A, { agent_grant: "not-an-agent-definition" }),
        entity_type: "note",
      })
    );
    expect(record.entity_type).toBe("note");
  });
});
