/**
 * Regression tests: entities.canonical_name must be re-derived when a later
 * observation changes the field it is derived from.
 *
 * The bug: `entities.canonical_name` was written once on the entity-creation
 * path and never refreshed. The re-derive helper (maybeRederiveCanonicalName)
 * existed but lived inside recomputeSnapshot(), which the MCP `store` path
 * never calls — it computes and upserts the snapshot inline. So a corrective
 * observation via target_id updated the snapshot while the entity-level
 * canonical_name stayed frozen at its creation value.
 *
 * Observed in production on a leads graph: a contact created as
 * "🦄 Rani Sweis" and later corrected to "Rani Sweis" kept the emoji in
 * entities.canonical_name indefinitely — and canonical_name is the field
 * entity lists and search display, so the stale value is what users see.
 *
 * Root cause: the MCP store path never called the re-derive at all. The helper
 * (maybeRederiveCanonicalName) lives inside recomputeSnapshot(), which that
 * path doesn't call — it computes and upserts the snapshot inline instead.
 *
 * Both transports are covered: the MCP `store` handler and the HTTP
 * `storeStructuredForApi` entry point.
 */

import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "crypto";
import { cleanupTestEntityType } from "../helpers/test_schema_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("store: entities.canonical_name re-derives on corrective observation", () => {
  const server = new NeotomaServer();
  (server as any).authenticatedUserId = TEST_USER_ID;
  const entityType = `test_contact_${randomUUID().replace(/-/g, "").substring(0, 8)}`;
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  async function registerSchema() {
    // Mirrors the real `contact` schema: ordered canonical_name_fields with
    // `identity_opt_out: "heuristic_canonical_name"`, which routes derivation
    // through the name-key path and stores a BARE canonical_name. (A schema
    // without identity_opt_out namespaces the value as `<entity_type>:<name>`,
    // which is a different storage shape and not what production contacts use.)
    await db.from("schema_registry").insert({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: false },
          title: { type: "string", required: false },
          schema_version: { type: "string", required: false },
        },
        canonical_name_fields: ["email", "external_id", "name"],
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          title: { strategy: "last_write" },
          schema_version: { strategy: "last_write" },
        },
      },
      active: true,
      scope: "user",
      user_id: TEST_USER_ID,
    });
  }

  async function storeEntity(fields: Record<string, unknown>) {
    const result = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `test-canonical-${randomUUID()}`,
      entities: [{ entity_type: entityType, schema_version: "1.0", ...fields }],
    });
    const response = JSON.parse(result.content[0].text);
    if (response.source_id) createdSourceIds.push(response.source_id);
    for (const e of response.entities ?? []) {
      if (e.entity_id && !createdEntityIds.includes(e.entity_id)) {
        createdEntityIds.push(e.entity_id);
      }
    }
    return response;
  }

  async function readEntityRow(entityId: string) {
    const { data } = await db
      .from("entities")
      .select("canonical_name, aliases")
      .eq("id", entityId)
      .maybeSingle();
    return data as { canonical_name: string; aliases: unknown } | null;
  }


  afterEach(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    await cleanupTestEntityType(entityType, TEST_USER_ID);
  });

  it("refreshes entities.canonical_name after a corrective store via target_id", async () => {
    await registerSchema();

    const created = await storeEntity({ name: "🦄 Rani Sweis", title: "Chief Creative" });
    const entityId = created.entities[0].entity_id;
    expect(created.entities[0].action).toBe("created");

    // Precondition: the emoji name is what got persisted at creation.
    expect((await readEntityRow(entityId))?.canonical_name).toBe("🦄 Rani Sweis");

    // Corrective observation — the exact shape an emoji cleanup uses.
    const corrected = await storeEntity({ target_id: entityId, name: "Rani Sweis" });
    expect(corrected.entities[0].action).toBe("extended");
    expect(corrected.unknown_fields_count).toBe(0);

    // The snapshot was always correct; the entity column is what regressed.
    const { data: snap } = await db
      .from("entity_snapshots")
      .select("snapshot")
      .eq("entity_id", entityId)
      .maybeSingle();
    expect((snap?.snapshot as Record<string, unknown>)?.name).toBe("Rani Sweis");

    const row = await readEntityRow(entityId);
    expect(row?.canonical_name).toBe("Rani Sweis");
    expect(row?.canonical_name).not.toContain("🦄");

    // The prior name is preserved so lookups by the old identifier still work.
    const aliases = Array.isArray(row?.aliases) ? (row?.aliases as string[]) : [];
    expect(aliases).toContain("🦄 Rani Sweis");
  });

  it("refuses the write rather than converging two entities on one canonical_name", async () => {
    await registerSchema();

    const occupant = await storeEntity({ name: "Taken Name" });
    const occupantId = occupant.entities[0].entity_id;

    const subject = await storeEntity({ name: "✨ Distinct Person" });
    const subjectId = subject.entities[0].entity_id;
    expect(subjectId).not.toBe(occupantId);

    // Renaming into an occupied slot would silently converge two distinct
    // records, so the re-derive declines it (logs "Skipping canonical_name
    // rename … already hashes to …") and leaves the row alone. The store
    // itself still succeeds — only the display-name refresh is skipped.
    const res = await storeEntity({ target_id: subjectId, name: "Taken Name" });
    expect(res.entities[0].action).toBe("extended");
    expect(res.entities[0].entity_id).toBe(subjectId);

    // Both rows keep the names they had.
    expect((await readEntityRow(subjectId))?.canonical_name).toBe("✨ Distinct Person");
    expect((await readEntityRow(occupantId))?.canonical_name).toBe("Taken Name");
  });

  it("leaves canonical_name in place when the corrective observation adds no name signal", async () => {
    await registerSchema();

    const created = await storeEntity({ name: "🌊 Ben Billups" });
    const entityId = created.entities[0].entity_id;

    // Touching an unrelated field must not blank or churn the canonical name.
    await storeEntity({ target_id: entityId, title: "Head of Waves" });

    expect((await readEntityRow(entityId))?.canonical_name).toBe("🌊 Ben Billups");
  });

  it("still re-derives canonical_name for a legacy row with NULL user_id", async () => {
    await registerSchema();

    const created = await storeEntity({ name: "🐚 Legacy Contact" });
    const entityId = created.entities[0].entity_id;

    // Simulate a legacy row written before user_id was stamped on entities —
    // the exact condition this PR's rewrite is meant to keep processable
    // (as distinct from a row owned by a genuinely different, non-null user).
    await db.from("entities").update({ user_id: null }).eq("id", entityId);
    expect((await db.from("entities").select("user_id").eq("id", entityId).maybeSingle()).data)
      .toEqual({ user_id: null });

    // Corrective observation under TEST_USER_ID's session — the acting user
    // is not the row's user_id, because the row has none.
    const corrected = await storeEntity({ target_id: entityId, name: "Legacy Contact" });
    expect(corrected.entities[0].action).toBe("extended");

    const row = await readEntityRow(entityId);
    expect(row?.canonical_name).toBe("Legacy Contact");
    expect(row?.canonical_name).not.toContain("🐚");
  });

  it("refuses to rename a row owned by a different, non-null user_id", async () => {
    await registerSchema();

    const created = await storeEntity({ name: "🦊 Other Tenant Contact" });
    const entityId = created.entities[0].entity_id;

    // Simulate a row genuinely owned by a different tenant (distinct from the
    // NULL-user_id legacy-row case above, which the rewrite is meant to keep
    // processable). This is the tenancy-guard branch: rowUserId !== null &&
    // rowUserId !== userId.
    const otherUserId = randomUUID();
    await db.from("entities").update({ user_id: otherUserId }).eq("id", entityId);
    expect((await db.from("entities").select("user_id").eq("id", entityId).maybeSingle()).data)
      .toEqual({ user_id: otherUserId });

    // Corrective observation under TEST_USER_ID's session — acting user does
    // not own this row.
    const corrected = await storeEntity({ target_id: entityId, name: "Renamed Contact" });
    expect(corrected.entities[0].action).toBe("extended");

    // The refusal is deliberate: canonical_name must stay unchanged.
    const row = await readEntityRow(entityId);
    expect(row?.canonical_name).toBe("🦊 Other Tenant Contact");
  });

  it("HTTP store path keeps entities.canonical_name fresh too (transport parity)", async () => {
    await registerSchema();

    const { storeStructuredForApi } = await import("../../src/actions.js");

    // NOTE: this helper takes camelCase `userId` / `idempotencyKey` /
    // `sourcePriority`. Passing snake_case (and silencing it with `as any`)
    // leaves userId undefined, which writes observations with a NULL user_id
    // and makes recomputeSnapshot's observation filter match nothing — the
    // symptom looks exactly like a product bug in the recompute path. Keep
    // these typed so a rename can't reintroduce that confusion silently.
    const createRes = await storeStructuredForApi({
      userId: TEST_USER_ID,
      idempotencyKey: `test-canonical-http-${randomUUID()}`,
      sourcePriority: 100,
      entities: [{ entity_type: entityType, schema_version: "1.0", name: "🚀 Rupert Barksfield" }],
    });
    const entityId = (createRes as { entities: Array<{ entity_id: string }> }).entities[0]
      .entity_id;
    createdEntityIds.push(entityId);

    // Observations must carry the caller's user_id; a NULL here silently
    // disables snapshot recompute for this entity.
    const { data: obs } = await db
      .from("observations")
      .select("user_id")
      .eq("entity_id", entityId);
    expect((obs ?? []).every((o) => (o as { user_id: string }).user_id === TEST_USER_ID)).toBe(
      true
    );

    await storeStructuredForApi({
      userId: TEST_USER_ID,
      idempotencyKey: `test-canonical-http-${randomUUID()}`,
      sourcePriority: 100,
      entities: [
        {
          entity_type: entityType,
          schema_version: "1.0",
          target_id: entityId,
          name: "Rupert Barksfield",
        },
      ],
    });

    expect((await readEntityRow(entityId))?.canonical_name).toBe("Rupert Barksfield");
  });
});
