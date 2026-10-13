/**
 * Fail-closed ownership guard at entity resolution (neotoma security fix).
 *
 * On an instance where entity ids are global (no tenant salt — the default,
 * unset NEOTOMA_TENANT_SCOPED_ENTITY_IDS and not sandbox mode), entity_id is
 * sha256(entity_type:canonical_name) with no user component. Before this fix,
 * when user B's store resolved to an entity_id already owned by user A,
 * resolution matched A's row anyway (logging a warning) and B's observation
 * landed on it, so A's snapshot changed. This suite proves the fix: B's
 * same-canonical-name write never changes A's snapshot, at every entrance
 * that can land an observation on an existing entity.
 *
 * Explicitly NOT covered by tenant-scoped ids (a separate migration, tracked
 * as a follow-up task): these tests run with global ids so they exercise the
 * exact collision the fix closes. A sibling suite
 * (entity_id_tenant_scope_resolution.test.ts) already proves tenant-scoped /
 * sandbox mode never collides in the first place.
 */

import { describe, expect, it } from "vitest";

import {
  EntityOwnerConflictError,
  LEGACY_UNOWNED_USER_ID,
  resolveEntityWithTrace,
} from "../../src/services/entity_resolution.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { createCorrection } from "../../src/services/correction.js";
import { db } from "../../src/db.js";

function stamp(): string {
  return `${Date.now()}-${Math.floor(performance.now() * 1000)}`;
}

async function readEntity(entityId: string): Promise<{ user_id: string | null } | null> {
  const { data } = await db.from("entities").select("user_id").eq("id", entityId).maybeSingle();
  return (data as { user_id: string | null } | null) ?? null;
}

async function readSnapshot(
  entityId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const raw = (data as { snapshot: unknown }).snapshot;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return (raw as Record<string, unknown>) ?? null;
}

async function countObservations(entityId: string): Promise<number> {
  const { data } = await db.from("observations").select("id").eq("entity_id", entityId);
  return (data as unknown[] | null)?.length ?? 0;
}

describe("cross-owner write refusal — resolveEntityWithTrace", () => {
  it("B's heuristic-match store on A's canonical_name is refused; A's snapshot never changes", async () => {
    const s = stamp();
    const userA = `owner-a-${s}`;
    const userB = `owner-b-${s}`;
    const name = `Cross Owner Contact ${s}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userA,
      commit: true,
    });
    expect(a.trace.action).toBe("created");

    const beforeCount = await countObservations(a.entityId);

    await expect(
      resolveEntityWithTrace({
        entityType: "contact",
        fields: { name },
        userId: userB,
        commit: true,
      })
    ).rejects.toBeInstanceOf(EntityOwnerConflictError);

    const row = await readEntity(a.entityId);
    expect(row?.user_id).toBe(userA);
    const afterCount = await countObservations(a.entityId);
    expect(afterCount).toBe(beforeCount);
  });

  it("B's explicit target_id naming A's entity is refused (bypasses derivation)", async () => {
    const s = stamp();
    const userA = `owner-a-${s}`;
    const userB = `owner-b-${s}`;
    const name = `Target Id Owner ${s}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userA,
      commit: true,
    });

    await expect(
      resolveEntityWithTrace({
        entityType: "contact",
        fields: { note: "unrelated fields" },
        userId: userB,
        commit: true,
        targetId: a.entityId,
      })
    ).rejects.toBeInstanceOf(EntityOwnerConflictError);

    const row = await readEntity(a.entityId);
    expect(row?.user_id).toBe(userA);
  });

  it("plan mode (commit:false) also refuses — a dry-run preview matches the real write", async () => {
    const s = stamp();
    const userA = `owner-a-${s}`;
    const userB = `owner-b-${s}`;
    const name = `Plan Mode Owner ${s}`;

    await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userA,
      commit: true,
    });

    await expect(
      resolveEntityWithTrace({
        entityType: "contact",
        fields: { name },
        userId: userB,
        commit: false,
      })
    ).rejects.toBeInstanceOf(EntityOwnerConflictError);
  });

  it("same-owner store still merges as before (no false positive)", async () => {
    const s = stamp();
    const user = `owner-same-${s}`;
    const name = `Same Owner Contact ${s}`;

    const first = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });
    expect(first.trace.action).toBe("created");

    const second = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name, phone: "+34123456789" },
      userId: user,
      commit: true,
    });
    expect(second.trace.action).toBe("matched_existing");
    expect(second.entityId).toBe(first.entityId);
  });

  it("adopts an unowned (null user_id) row on first real writer — not a conflict", async () => {
    const s = stamp();
    const name = `Legacy Unowned Contact ${s}`;
    const user = `owner-adopt-${s}`;

    // Simulate a legacy row with no owner (pre-auth data), inserted directly.
    const { generateEntityId, normalizeEntityValue, formatCanonicalNameForStorage } =
      await import("../../src/services/entity_resolution.js");
    void normalizeEntityValue;
    const canonicalName = formatCanonicalNameForStorage("contact", name);
    const entityId = generateEntityId("contact", canonicalName);
    const now = new Date().toISOString();
    await db.from("entities").insert({
      id: entityId,
      entity_type: "contact",
      canonical_name: canonicalName,
      aliases: [],
      user_id: null,
      created_at: now,
      updated_at: now,
    });

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });
    expect(result.entityId).toBe(entityId);
    expect(result.trace.action).toBe("matched_existing");

    const row = await readEntity(entityId);
    expect(row?.user_id).toBe(user);
  });

  it("adopts the legacy default-test-user-id row — not a conflict", async () => {
    const s = stamp();
    const name = `Legacy Default Test User Contact ${s}`;
    const user = `owner-adopt-default-${s}`;

    const { generateEntityId, formatCanonicalNameForStorage } =
      await import("../../src/services/entity_resolution.js");
    const canonicalName = formatCanonicalNameForStorage("contact", name);
    const entityId = generateEntityId("contact", canonicalName);
    const now = new Date().toISOString();
    await db.from("entities").insert({
      id: entityId,
      entity_type: "contact",
      canonical_name: canonicalName,
      aliases: [],
      user_id: LEGACY_UNOWNED_USER_ID,
      created_at: now,
      updated_at: now,
    });

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });
    expect(result.trace.action).toBe("matched_existing");
    const row = await readEntity(entityId);
    expect(row?.user_id).toBe(user);
  });
});

describe("cross-owner write refusal — createObservation choke point", () => {
  it("refuses a direct createObservation call targeting another user's entity_id", async () => {
    const s = stamp();
    const userA = `owner-a-${s}`;
    const userB = `owner-b-${s}`;
    const name = `Direct Observation Owner ${s}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userA,
      commit: true,
    });
    const beforeCount = await countObservations(a.entityId);

    await expect(
      createObservation({
        entity_id: a.entityId,
        entity_type: "contact",
        schema_version: "1.0",
        source_id: null,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1,
        source_priority: 100,
        fields: { note: "attacker-controlled write" },
        user_id: userB,
      })
    ).rejects.toBeInstanceOf(EntityOwnerConflictError);

    const afterCount = await countObservations(a.entityId);
    expect(afterCount).toBe(beforeCount);
    const row = await readEntity(a.entityId);
    expect(row?.user_id).toBe(userA);
  });
});

describe("cross-owner write refusal — createCorrection choke point", () => {
  it("refuses a direct createCorrection call targeting another user's entity_id", async () => {
    const s = stamp();
    const userA = `owner-a-${s}`;
    const userB = `owner-b-${s}`;
    const name = `Direct Correction Owner ${s}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userA,
      commit: true,
    });
    const beforeSnapshot = await readSnapshot(a.entityId, userA);

    await expect(
      createCorrection({
        entity_id: a.entityId,
        entity_type: "contact",
        field: "name",
        value: "Renamed By Attacker",
        schema_version: "1.0",
        user_id: userB,
      })
    ).rejects.toBeInstanceOf(EntityOwnerConflictError);

    const afterSnapshot = await readSnapshot(a.entityId, userA);
    expect(afterSnapshot).toEqual(beforeSnapshot);
    const row = await readEntity(a.entityId);
    expect(row?.user_id).toBe(userA);
  });

  it("same-owner correction still applies as before (no false positive)", async () => {
    const s = stamp();
    const user = `owner-correct-same-${s}`;
    const name = `Correctable Owner ${s}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });

    const result = await createCorrection({
      entity_id: a.entityId,
      entity_type: "contact",
      field: "name",
      value: "Corrected Name",
      schema_version: "1.0",
      user_id: user,
    });
    expect(result.field).toBe("name");
    expect(result.value).toBe("Corrected Name");
  });
});
