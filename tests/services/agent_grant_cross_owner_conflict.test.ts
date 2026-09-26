/**
 * agent_grant is the entity_type that motivated the fix (see the security
 * finding this PR closes): its schema's canonical_name_fields prefers
 * match_thumbprint, then falls back to a (match_sub, match_iss) composite,
 * then match_sub alone (src/services/schema_definitions.ts, ENTITY_SCHEMAS.
 * agent_grant). PR #2513 closes the match_thumbprint vector (one owner per
 * pinned thumbprint, enforced at every write entrance). This suite covers
 * the case #2513 explicitly leaves open: two grants created with the SAME
 * match_sub + match_iss and NO match_thumbprint resolve to the SAME
 * canonical_name — and, on a global-id instance, the SAME entity_id. Before
 * this fix, user B creating (or correcting) a grant with A's match_sub/
 * match_iss landed an observation on A's grant and changed its label,
 * capabilities, or status.
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  createGrant,
  getGrant,
  setStatus,
  updateGrantFields,
} from "../../src/services/agent_grants.js";
import { EntityOwnerConflictError } from "../../src/services/entity_resolution.js";
import { createCorrection } from "../../src/services/correction.js";
import { db } from "../../src/db.js";

describe("agent_grant: match_sub+match_iss collision without a thumbprint", () => {
  it("B creating a grant with A's (match_sub, match_iss) is refused; A's grant is untouched", async () => {
    const s = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const userA = `grant-owner-a-${s}`;
    const userB = `grant-owner-b-${s}`;
    const match_sub = `agent-sub-${s}`;
    const match_iss = `https://issuer.example/${s}`;

    const grantA = await createGrant(userA, {
      label: "A's agent",
      match_sub,
      match_iss,
      capabilities: [{ op: "store", entity_types: ["contact"] }],
    });
    expect(grantA.match_thumbprint ?? null).toBeNull();

    // B attempts to create a grant with the SAME (match_sub, match_iss) and no
    // thumbprint — resolution lands on A's entity_id (global ids, no tenant
    // salt). Must be refused, not merged. createGrant routes through
    // storeStructuredForApi's structured-store batch path, which wraps a
    // per-observation EntityOwnerConflictError into the same
    // ERR_STORE_RESOLUTION_FAILED aggregate every other resolution refusal on
    // that path uses (see src/actions.ts) — assert on the wrapped code/issue
    // rather than the raw error class.
    let caught: unknown;
    try {
      await createGrant(userB, {
        label: "B's hijack attempt",
        match_sub,
        match_iss,
        capabilities: [{ op: "store", entity_types: ["*"] }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe("ERR_STORE_RESOLUTION_FAILED");
    const issues = (caught as { issues?: Array<{ code?: string }> }).issues ?? [];
    expect(issues.some((iss) => iss.code === "entity_owner_conflict")).toBe(true);

    // A's grant is exactly as it was: same label, same capabilities, still
    // owned by A.
    const reread = await getGrant(userA, grantA.grant_id);
    expect(reread).not.toBeNull();
    expect(reread?.label).toBe("A's agent");
    expect(reread?.capabilities).toEqual([{ op: "store", entity_types: ["contact"] }]);

    const { data: row } = await db
      .from("entities")
      .select("user_id")
      .eq("id", grantA.grant_id)
      .maybeSingle();
    expect((row as { user_id: string | null } | null)?.user_id).toBe(userA);
  });

  it("updateGrantFields(B, A's grant_id, ...) is already safe (getGrant 404s before any write)", async () => {
    const s = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const userA = `grant-owner-a-${s}`;
    const userB = `grant-owner-b-${s}`;
    const match_sub = `agent-sub-correct-${s}`;
    const match_iss = `https://issuer.example/${s}`;

    const grantA = await createGrant(userA, {
      label: "A's agent (correct target)",
      match_sub,
      match_iss,
      capabilities: [{ op: "store", entity_types: ["contact"] }],
    });

    // Documents existing-safe behavior for contrast with the raw correct()
    // surface below: updateGrantFields resolves `existing` via
    // getGrant(userId, grantId), which is itself owner-scoped, so it 404s
    // (AgentGrantNotFoundError) for B before createCorrection is ever called.
    await expect(
      updateGrantFields(userB, grantA.grant_id, { label: "Hijacked label" })
    ).rejects.toThrow();

    const reread = await getGrant(userA, grantA.grant_id);
    expect(reread?.label).toBe("A's agent (correct target)");
  });

  it("setStatus(B, A's grant_id, ...) is already safe (getGrant 404s before any write)", async () => {
    const s = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const userA = `grant-owner-a-${s}`;
    const userB = `grant-owner-b-${s}`;
    const match_sub = `agent-sub-status-${s}`;
    const match_iss = `https://issuer.example/${s}`;

    const grantA = await createGrant(userA, {
      label: "A's agent (status target)",
      match_sub,
      match_iss,
      capabilities: [{ op: "store", entity_types: ["contact"] }],
    });

    await expect(setStatus(userB, grantA.grant_id, "revoked")).rejects.toThrow();

    const reread = await getGrant(userA, grantA.grant_id);
    expect(reread?.status).toBe("active");
  });

  it("the raw correct() surface targeting A's grant_id under B is refused (the actual open vector)", async () => {
    // This is the vector the finding names: "both landed via correct, not via
    // PATCH /agents/grants/{id}" — createCorrection is the raw entity-store
    // surface that bypasses updateGrantFields'/setStatus' own getGrant
    // ownership check entirely. Before this fix, this call would have
    // written a `capabilities` correction straight onto A's grant row under
    // B's user_id.
    const s = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const userA = `grant-owner-a-${s}`;
    const userB = `grant-owner-b-${s}`;
    const match_sub = `agent-sub-raw-correct-${s}`;
    const match_iss = `https://issuer.example/${s}`;

    const grantA = await createGrant(userA, {
      label: "A's agent (raw correct target)",
      match_sub,
      match_iss,
      capabilities: [{ op: "store", entity_types: ["contact"] }],
    });

    await expect(
      createCorrection({
        entity_id: grantA.grant_id,
        entity_type: "agent_grant",
        field: "capabilities",
        value: [{ op: "store", entity_types: ["*"] }],
        schema_version: "1.0.0",
        user_id: userB,
      })
    ).rejects.toBeInstanceOf(EntityOwnerConflictError);

    const reread = await getGrant(userA, grantA.grant_id);
    expect(reread?.capabilities).toEqual([{ op: "store", entity_types: ["contact"] }]);
  });

  it("A creating a second grant with the same (match_sub, match_iss) still merges (idempotent replay)", async () => {
    const s = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const userA = `grant-owner-a-idem-${s}`;
    const match_sub = `agent-sub-idem-${s}`;
    const match_iss = `https://issuer.example/${s}`;

    const first = await createGrant(userA, {
      label: "First import",
      match_sub,
      match_iss,
      capabilities: [{ op: "store", entity_types: ["contact"] }],
    });

    // createGrant's idempotency key is deterministic on (userId, thumbprint,
    // sub, iss) alone (see writeGrantEntity), so a second call with the SAME
    // identity and IDENTICAL content is a true idempotent replay — same
    // owner, same identity key, same entity_id, no merge-refusal path
    // involved. A changed payload under an unchanged key is a distinct,
    // pre-existing ERR_IDEMPOTENCY_MISMATCH behavior, not part of this fix;
    // updateGrantFields is the real path for changing an existing grant.
    const second = await createGrant(userA, {
      label: "First import",
      match_sub,
      match_iss,
      capabilities: [{ op: "store", entity_types: ["contact"] }],
    });

    expect(second.grant_id).toBe(first.grant_id);

    const updated = await updateGrantFields(userA, first.grant_id, {
      capabilities: [{ op: "store", entity_types: ["contact", "company"] }],
    });
    expect(updated.grant_id).toBe(first.grant_id);
    expect(updated.capabilities).toEqual([{ op: "store", entity_types: ["contact", "company"] }]);
  });
});
