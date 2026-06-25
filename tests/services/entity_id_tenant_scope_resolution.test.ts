/**
 * Integration: tenant-scoped entity-id resolution (the sandbox per-visitor fix).
 *
 * Codifies the core behavioral claim of the pack-seeding fix that unit tests
 * (salt function + gate) could not cover: with tenant-scoped ids enabled, two
 * different users resolving the SAME (entity_type, canonical_name) get two
 * DISTINCT entity rows — they no longer collide on the global primary key.
 *
 * Without the fix, the second resolve `matched_existing` against the first
 * user's row and created nothing for itself (the empty-workspace bug).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveEntityWithTrace } from "../../src/services/entity_resolution.js";
import { db } from "../../src/db.js";

describe("tenant-scoped entity-id resolution", () => {
  let prev: string | undefined;

  beforeAll(() => {
    prev = process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
    process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "1";
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
    else process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = prev;
  });

  it("two tenants with the same name resolve to distinct, per-tenant rows", async () => {
    const stamp = `${Date.now()}-${Math.floor(performance.now())}`;
    const name = `Shared Tenant Name ${stamp}`;
    const userA = `tenant-a-${stamp}`;
    const userB = `tenant-b-${stamp}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userA,
      commit: true,
    });
    const b = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userB,
      commit: true,
    });

    // Distinct ids — the whole point of the fix.
    expect(a.entityId).not.toBe(b.entityId);
    // Both are fresh creations; neither matched the other's row.
    expect(a.trace.action).toBe("created");
    expect(b.trace.action).toBe("created");

    // Each row is owned by its own tenant.
    const { data: rowA } = await db
      .from("entities")
      .select("id, user_id")
      .eq("id", a.entityId)
      .maybeSingle();
    const { data: rowB } = await db
      .from("entities")
      .select("id, user_id")
      .eq("id", b.entityId)
      .maybeSingle();
    expect(rowA?.user_id).toBe(userA);
    expect(rowB?.user_id).toBe(userB);
  });

  it("the same tenant + same name stays idempotent (one row)", async () => {
    const stamp = `${Date.now()}-${Math.floor(performance.now())}`;
    const name = `Same Tenant Name ${stamp}`;
    const user = `tenant-c-${stamp}`;

    const first = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });
    const second = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });

    expect(second.entityId).toBe(first.entityId);
    expect(second.trace.action).toBe("matched_existing");
  });
});
