/**
 * Tenant isolation for the MCP instruction-entity loader (#2054).
 *
 * Companion to `tenant_isolation_matrix.test.ts`, which drives HTTP query
 * endpoints. This covers the orthogonal path that matrix cannot reach: the
 * session-start loader behind `serverInfo._neotoma.instruction_entities`,
 * which runs inside `initialize` rather than behind an HTTP endpoint.
 *
 * The threat model is the same. An authenticated caller MUST NOT receive
 * another user's `standing_rule` or `agent_policy` content, and generalizing
 * the loader from one entity type to a configurable set widens the surface
 * that invariant has to hold across — every per-type query must still filter
 * on `user_id`, not just the one the loader was originally written for.
 *
 * A second invariant is asserted here because #2054 introduced it: a
 * `domain`-scoped policy is admitted only on a server-resolved agent
 * identity. A caller that could name its own domain could pull another
 * agent's private policies into its session, so the domain half of the scope
 * union must never be satisfiable by caller-supplied input.
 *
 * Uses the real database — no mock — so a query that drops the `user_id`
 * filter actually fails here rather than passing against a fixture.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { getInstructionEntitiesResult } from "../../src/services/standing_rules.js";

const TEST_PREFIX = "instr_iso_test";

const OPTIONS = {
  entityTypes: ["standing_rule", "agent_policy"],
  scopes: ["global", "swarm"],
  maxEntities: 50,
};

interface SeededUser {
  userId: string;
  ruleId: string;
  policyId: string;
  domainPolicyId: string;
  ruleText: string;
  policyText: string;
  domain: string;
}

const createdEntityIds: string[] = [];

async function seedEntity(
  userId: string,
  entityId: string,
  entityType: string,
  canonicalName: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  createdEntityIds.push(entityId);
  await db.from("entities").insert({
    id: entityId,
    user_id: userId,
    entity_type: entityType,
    canonical_name: canonicalName,
    merged_to_entity_id: null,
  });
  await db.from("entity_snapshots").insert({
    entity_id: entityId,
    user_id: userId,
    entity_type: entityType,
    schema_version: "1.0.0",
    canonical_name: canonicalName,
    snapshot,
    observation_count: 1,
    last_observation_at: new Date().toISOString(),
    provenance: {},
    computed_at: new Date().toISOString(),
  });
}

async function seedUser(label: string): Promise<SeededUser> {
  const userId = randomUUID();
  const suffix = `${label}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ruleId = `${TEST_PREFIX}_sr_${suffix}`;
  const policyId = `${TEST_PREFIX}_ap_${suffix}`;
  const domainPolicyId = `${TEST_PREFIX}_apd_${suffix}`;
  const ruleText = `${label} PRIVATE RULE TEXT ${suffix}`;
  const policyText = `${label} PRIVATE POLICY TEXT ${suffix}`;
  const domain = `${label}-agent@ateles-swarm`;

  await seedEntity(userId, ruleId, "standing_rule", `${label} Rule`, {
    title: `${label} Rule`,
    rule_text: ruleText,
    enabled: true,
    priority: 100,
  });

  await seedEntity(userId, policyId, "agent_policy", `${label} Policy`, {
    title: `${label} Policy`,
    rule: policyText,
    status: "active",
    rule_kind: "mandatory",
    scope: "global",
  });

  await seedEntity(userId, domainPolicyId, "agent_policy", `${label} Domain Policy`, {
    title: `${label} Domain Policy`,
    rule: `${label} DOMAIN SCOPED TEXT ${suffix}`,
    status: "active",
    rule_kind: "mandatory",
    scope: "copy",
    domain,
  });

  return { userId, ruleId, policyId, domainPolicyId, ruleText, policyText, domain };
}

describe("instruction-entity loader tenant isolation (#2054)", () => {
  let alice: SeededUser;
  let bob: SeededUser;

  beforeAll(async () => {
    alice = await seedUser("alice");
    bob = await seedUser("bob");
  });

  afterAll(async () => {
    for (const id of createdEntityIds) {
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  it("returns only the requesting user's entities", async () => {
    const result = await getInstructionEntitiesResult(alice.userId, OPTIONS);
    const ids = result.entities.map((e) => e.entity_id);

    expect(ids).toContain(alice.ruleId);
    expect(ids).toContain(alice.policyId);

    expect(ids).not.toContain(bob.ruleId);
    expect(ids).not.toContain(bob.policyId);
    expect(ids).not.toContain(bob.domainPolicyId);
  });

  it("never leaks another user's instruction text", async () => {
    const result = await getInstructionEntitiesResult(alice.userId, OPTIONS);
    const serialized = JSON.stringify(result.entities);

    expect(serialized).toContain(alice.ruleText);
    expect(serialized).not.toContain(bob.ruleText);
    expect(serialized).not.toContain(bob.policyText);
  });

  it("isolates every configured entity type, not just standing_rule", async () => {
    // Generalizing the loader means the user_id filter has to hold on each
    // per-type query. Asserted per type so a dropped filter on the newer
    // agent_policy query cannot hide behind a correctly-filtered
    // standing_rule query.
    const policyOnly = await getInstructionEntitiesResult(alice.userId, {
      ...OPTIONS,
      entityTypes: ["agent_policy"],
    });
    expect(policyOnly.entities.map((e) => e.entity_id)).not.toContain(bob.policyId);

    const ruleOnly = await getInstructionEntitiesResult(alice.userId, {
      ...OPTIONS,
      entityTypes: ["standing_rule"],
    });
    expect(ruleOnly.entities.map((e) => e.entity_id)).not.toContain(bob.ruleId);
  });

  it("does not admit another user's domain-scoped policy even on a matching domain", async () => {
    // Alice's session claiming Bob's agent domain must still see nothing of
    // Bob's: the domain match widens scope within a tenant, never across one.
    const result = await getInstructionEntitiesResult(alice.userId, {
      ...OPTIONS,
      agentIdentity: bob.domain,
    });
    const ids = result.entities.map((e) => e.entity_id);

    expect(ids).not.toContain(bob.domainPolicyId);
    expect(ids).not.toContain(bob.policyId);
  });

  it("admits a domain-scoped policy only to the matching agent identity", async () => {
    const withIdentity = await getInstructionEntitiesResult(alice.userId, {
      ...OPTIONS,
      agentIdentity: alice.domain,
    });
    expect(withIdentity.entities.map((e) => e.entity_id)).toContain(alice.domainPolicyId);

    // No resolved identity: shared rules still load, per-agent rules do not.
    const withoutIdentity = await getInstructionEntitiesResult(alice.userId, {
      ...OPTIONS,
      agentIdentity: null,
    });
    const ids = withoutIdentity.entities.map((e) => e.entity_id);
    expect(ids).toContain(alice.policyId);
    expect(ids).not.toContain(alice.domainPolicyId);
  });
});
