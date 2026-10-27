/**
 * Resolving an existing entity must not rewrite user_id to the value it
 * already holds (#2731).
 *
 * On a single-owner instance whose authenticated owner IS the legacy all-zero
 * user id, the adoption branch in resolveEntityWithTrace used to fire on every
 * committed resolution of an existing entity: `existing.user_id` and `userId`
 * were both the all-zero id, so it issued `UPDATE entities SET user_id = <same>,
 * updated_at = now()` and logged "Updated user_id ...". That is a pointless
 * write on the hot path of every store, and it bumped updated_at with no data
 * change.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LEGACY_UNOWNED_USER_ID,
  formatCanonicalNameForStorage,
  generateEntityId,
  resolveEntityWithTrace,
} from "../../src/services/entity_resolution.js";
import { db } from "../../src/db.js";
import { logger } from "../../src/utils/logger.js";

function stamp(): string {
  return `${Date.now()}-${Math.floor(performance.now() * 1000)}`;
}

async function readEntity(
  entityId: string
): Promise<{ user_id: string | null; updated_at: string } | null> {
  const { data } = await db
    .from("entities")
    .select("user_id, updated_at")
    .eq("id", entityId)
    .maybeSingle();
  return (data as { user_id: string | null; updated_at: string } | null) ?? null;
}

/** Record every `.update(...)` issued against the `entities` table. */
function spyOnEntityUpdates(): { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  const realFrom = db.from.bind(db);
  vi.spyOn(db, "from").mockImplementation(((table: string) => {
    const builder = realFrom(table as never) as unknown as {
      update: (...args: unknown[]) => unknown;
    };
    if (table === "entities") {
      const realUpdate = builder.update.bind(builder);
      builder.update = (...args: unknown[]) => {
        calls.push(args[0] as Record<string, unknown>);
        return realUpdate(...args);
      };
    }
    return builder;
  }) as never);
  return { calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveEntityWithTrace — user_id adoption is not a no-op rewrite (#2731)", () => {
  it("re-resolving an entity owned by the all-zero default user issues no UPDATE and no log line", async () => {
    const name = `Userid Noop Contact ${stamp()}`;

    const first = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: LEGACY_UNOWNED_USER_ID,
      commit: true,
    });
    expect(first.trace.action).toBe("created");
    const before = await readEntity(first.entityId);
    expect(before?.user_id).toBe(LEGACY_UNOWNED_USER_ID);

    // Make any rewrite observable as a changed updated_at.
    await new Promise((resolve) => setTimeout(resolve, 15));

    const updates = spyOnEntityUpdates();
    const infoSpy = vi.spyOn(logger, "info");

    const second = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: LEGACY_UNOWNED_USER_ID,
      commit: true,
    });
    expect(second.entityId).toBe(first.entityId);
    expect(second.trace.action).toBe("matched_existing");

    expect(updates.calls).toEqual([]);
    const updatedUserIdLogs = infoSpy.mock.calls.filter((args) =>
      String(args[0]).includes("Updated user_id")
    );
    expect(updatedUserIdLogs).toEqual([]);

    const after = await readEntity(first.entityId);
    expect(after?.user_id).toBe(LEGACY_UNOWNED_USER_ID);
    expect(after?.updated_at).toBe(before?.updated_at);
  });

  it("still adopts a row owned by the all-zero default user for a real, non-zero userId", async () => {
    const s = stamp();
    const name = `Userid Adopt Contact ${s}`;
    const user = `owner-adopt-noop-${s}`;

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

    const updates = spyOnEntityUpdates();
    const infoSpy = vi.spyOn(logger, "info");

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });
    expect(result.trace.action).toBe("matched_existing");

    expect(updates.calls).toHaveLength(1);
    expect(updates.calls[0]?.user_id).toBe(user);
    expect(infoSpy.mock.calls.some((args) => String(args[0]).includes("Updated user_id"))).toBe(
      true
    );
    expect((await readEntity(entityId))?.user_id).toBe(user);
  });

  it("still adopts a null-owner row for a real userId", async () => {
    const s = stamp();
    const name = `Userid Adopt Null Contact ${s}`;
    const user = `owner-adopt-null-${s}`;

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

    await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: user,
      commit: true,
    });
    expect((await readEntity(entityId))?.user_id).toBe(user);
  });
});
