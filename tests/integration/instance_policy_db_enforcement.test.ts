/**
 * DB-backed enforcement for the instance store policy (#1974/#1975).
 *
 * ## Why this exists alongside tests/unit/instance_policy.test.ts
 *
 * The unit suite passes its policy through `policyOverride`, which skips
 * `getInstancePolicy()` entirely. That is a legitimate way to test the
 * predicates, but it means the load path — the part that reads the policy out
 * of the database — was never exercised. And the load path was broken: it
 * selected `entity_snapshots!inner(snapshot)`, a PostgREST embed hint that
 * libSQL rejects with `unrecognized token: "!"`. The old code then failed OPEN
 * to `null`, so an `enforced` policy silently never loaded outside the test
 * harness. Every unit test passed; enforcement did not exist on the local
 * backend.
 *
 * So these tests use NO policy override and NO database mock. They seed a real
 * `instance_policy` row and assert the effect a reporter can observe: a write
 * that the stored policy forbids is actually rejected.
 *
 * The second describe-block covers the other half of the same defect — what
 * happens when the policy cannot be read at all. That must fail CLOSED, and it
 * must be distinguishable from a denial, so an agent retries rather than
 * quietly narrowing what it stores because of an outage.
 */

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "../../src/db.js";
import {
  assertStorePolicyAllows,
  evaluateStorePolicy,
  getInstancePolicy,
  getInstancePolicyResult,
  StorePolicyDeniedError,
  StorePolicyUnavailableError,
} from "../../src/services/instance_policy.js";
import { cleanupTestEntity, cleanupEntitySnapshot } from "../helpers/cleanup_helpers.js";

const POLICY_ENTITY_ID = `ent_test_pol_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const DENIED_TYPE = "test_policy_denied_type";
const ALLOWED_TYPE = "test_policy_allowed_type";

/** No schema lookups are needed for entity-type predicates. */
const noSchema = async () => null;

async function seedEnforcedPolicy(): Promise<void> {
  const snapshot = {
    purpose: "DB-backed enforcement test",
    out_of_scope_entity_types: [DENIED_TYPE],
    enforcement: "enforced",
    policy_id: "test-policy-db-enforcement",
  };

  await db.from("entities").insert({
    id: POLICY_ENTITY_ID,
    user_id: null,
    entity_type: "instance_policy",
    canonical_name: "Test Instance Policy",
    merged_to_entity_id: null,
  });

  await db.from("entity_snapshots").insert({
    entity_id: POLICY_ENTITY_ID,
    user_id: null,
    entity_type: "instance_policy",
    schema_version: "1.0.0",
    canonical_name: "Test Instance Policy",
    snapshot,
    observation_count: 1,
    last_observation_at: new Date().toISOString(),
    provenance: {},
    computed_at: new Date().toISOString(),
  });
}

describe("instance policy loads from the database and enforces (#1975)", () => {
  beforeAll(async () => {
    await seedEnforcedPolicy();
  });

  afterAll(async () => {
    await cleanupEntitySnapshot(POLICY_ENTITY_ID);
    await cleanupTestEntity(POLICY_ENTITY_ID);
  });

  it("reads the stored policy through the real load path", async () => {
    const policy = await getInstancePolicy();

    // The #2131-class failure is precisely `null` here while a row exists.
    expect(policy, "stored instance_policy did not load").not.toBeNull();
    expect(policy?.enforcement).toBe("enforced");
    expect(policy?.out_of_scope_entity_types).toContain(DENIED_TYPE);
  });

  it("denies an out-of-scope write with no policyOverride", async () => {
    // No third argument: this resolves the policy from the database, which is
    // the path the unit suite bypasses.
    const denied = await evaluateStorePolicy(
      [{ entity_type: DENIED_TYPE, fields: { note: "should not persist" } }],
      noSchema
    );

    expect(denied).toHaveLength(1);
    expect(denied[0].entity_type).toBe(DENIED_TYPE);
    expect(denied[0].reason_code).toBe("entity_type_denied");
  });

  it("throws StorePolicyDeniedError from the assert wrapper", async () => {
    await expect(
      assertStorePolicyAllows(
        [{ entity_type: DENIED_TYPE, fields: { note: "should not persist" } }],
        noSchema
      )
    ).rejects.toBeInstanceOf(StorePolicyDeniedError);
  });

  it("allows a write the stored policy does not forbid", async () => {
    await expect(
      assertStorePolicyAllows([{ entity_type: ALLOWED_TYPE, fields: { note: "fine" } }], noSchema)
    ).resolves.toBeUndefined();
  });
});

describe("an unreadable policy fails closed and says why (#1975)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Make the policy lookup fail the way a driver rejection actually does. */
  function breakPolicyLookup(message: string): void {
    vi.spyOn(db, "from").mockImplementation(((table: string) => {
      if (table === "entity_snapshots") {
        throw new Error(message);
      }
      // Other tables keep working, so this isolates the policy read.
      return {
        select: () => ({
          eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        }),
      };
    }) as unknown as typeof db.from);
  }

  it("reports lookup_failed rather than an empty policy", async () => {
    breakPolicyLookup("connection reset");

    const result = await getInstancePolicyResult();

    // The whole point: this must not look like "no policy configured".
    expect(result.lookup_failed).toBe(true);
    expect(result.policy).toBeNull();
    expect(result.error).toContain("connection reset");
  });

  it("refuses the write instead of admitting it unchecked", async () => {
    breakPolicyLookup("connection reset");

    // Fail closed: an outage must not silently suspend the instance boundary.
    await expect(
      assertStorePolicyAllows([{ entity_type: ALLOWED_TYPE, fields: {} }], noSchema)
    ).rejects.toBeInstanceOf(StorePolicyUnavailableError);
  });

  it("is a different error from a policy denial, and says it is retryable", async () => {
    breakPolicyLookup("connection reset");

    const error = await assertStorePolicyAllows(
      [{ entity_type: ALLOWED_TYPE, fields: {} }],
      noSchema
    ).catch((e: unknown) => e);

    // An agent branching on the error must not confuse an infrastructure fault
    // with a policy boundary — that is what would make it narrow its payload in
    // response to an outage.
    expect(error).not.toBeInstanceOf(StorePolicyDeniedError);

    const envelope = (error as StorePolicyUnavailableError).toErrorEnvelope();
    expect(envelope.code).toBe("ERR_STORE_POLICY_UNAVAILABLE");
    expect(envelope.retryable).toBe(true);
    expect(envelope.message).toMatch(/not a policy decision/i);
    expect(envelope.hint).toMatch(/retry/i);
  });

  it("still honours an explicit policyOverride while the DB is unreadable", async () => {
    breakPolicyLookup("connection reset");

    // An override means the caller already resolved the policy, so there is no
    // read to fail — this must not throw the unavailable error.
    await expect(
      assertStorePolicyAllows([{ entity_type: ALLOWED_TYPE, fields: {} }], noSchema, null)
    ).resolves.toBeUndefined();
  });
});
