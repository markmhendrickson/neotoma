/**
 * Lexical search filters candidates in SQL on entity_snapshots.search_text.
 *
 * Parity: every fixture query must give the same ordered ids, total and
 * strategy labels whether search_text is filled (SQL filter active) or NULL
 * for every fixture row (each row loaded and judged in code, which is exactly
 * the pre-filter path). Behaviour: a selective search over 2,000 rows loads
 * about one row (`lexical_rows_loaded`). Surfaces: REST POST /entities/query
 * and MCP retrieve_entities return the same ids as the service call.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db, getServiceRoleClient } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import {
  lexicalSearchEntityIds,
  queryEntitiesWithCount,
} from "../../src/shared/action_handlers/entity_handlers.js";
import {
  buildEntityLexicalSearchText,
  loadRawFragmentTextByEntityId,
} from "../../src/shared/entity_search_text.js";
import type { EntityReadTrace } from "../../src/shared/entity_read_contract.js";

const serviceRoleClient = getServiceRoleClient();
const RUN = randomUUID().replace(/-/g, "").slice(0, 8);
const USER = `lexical-sql-filter-${RUN}`;
const NIL_USER = "00000000-0000-0000-0000-000000000000";
const NOTE = `synthetic_lexsql_${RUN}_note`;
const BULK = `synthetic_lexsql_${RUN}_bulk`;
const API_PORT = 18291;

const created: string[] = [];
/** Fixture rows deliberately left with a NULL search_text in the "filled" state. */
const keepNull = new Set<string>();

async function addEntity(params: {
  id: string;
  userId?: string;
  entityType: string;
  canonicalName: string;
  snapshot: Record<string, unknown>;
  fragments?: Array<{ key: string; value: unknown }>;
  mergedTo?: string;
}): Promise<void> {
  const userId = params.userId ?? USER;
  const now = new Date().toISOString();
  await serviceRoleClient.from("entities").insert({
    id: params.id,
    user_id: userId,
    entity_type: params.entityType,
    canonical_name: params.canonicalName,
    ...(params.mergedTo ? { merged_to_entity_id: params.mergedTo, merged_at: now } : {}),
  });
  created.push(params.id);
  await serviceRoleClient.from("entity_snapshots").upsert({
    entity_id: params.id,
    user_id: userId,
    entity_type: params.entityType,
    schema_version: "1.0",
    canonical_name: params.canonicalName,
    snapshot: params.snapshot,
    provenance: {},
    observation_count: 1,
    last_observation_at: now,
    computed_at: now,
  });
  for (const [i, fragment] of (params.fragments ?? []).entries()) {
    await serviceRoleClient.from("raw_fragments").insert({
      id: `frag_${params.id}_${i}`,
      entity_id: params.id,
      user_id: userId,
      entity_type: params.entityType,
      fragment_key: fragment.key,
      fragment_value: fragment.value,
    });
  }
}

/** Store the text search would build now (except rows kept NULL). */
async function fillSearchText(ids: string[]): Promise<void> {
  const conn = await getDb();
  const targets = ids.filter((id) => !keepNull.has(id));
  await nullSearchText(ids.filter((id) => keepNull.has(id)));
  const fragments = await loadRawFragmentTextByEntityId(targets);
  for (let i = 0; i < targets.length; i += 500) {
    const chunk = targets.slice(i, i + 500);
    const { data: entities } = await db
      .from("entities")
      .select("id, canonical_name")
      .in("id", chunk);
    const { data: snapshots } = await db
      .from("entity_snapshots")
      .select("entity_id, snapshot")
      .in("entity_id", chunk);
    const snapById = new Map(
      ((snapshots ?? []) as Array<{ entity_id: string; snapshot: unknown }>).map((s) => [
        s.entity_id,
        s.snapshot,
      ])
    );
    for (const entity of (entities ?? []) as Array<{ id: string; canonical_name: string }>) {
      const text = buildEntityLexicalSearchText(
        entity.canonical_name,
        snapById.get(entity.id),
        fragments.get(entity.id)
      );
      await conn
        .prepare("UPDATE entity_snapshots SET search_text = ? WHERE entity_id = ?")
        .run(text, entity.id);
    }
  }
}

async function nullSearchText(ids: string[]): Promise<void> {
  const conn = await getDb();
  for (const id of ids) {
    await conn.prepare("UPDATE entity_snapshots SET search_text = NULL WHERE entity_id = ?").run(id);
  }
}

async function nullCount(ids: string[]): Promise<number> {
  const conn = await getDb();
  let n = 0;
  for (const id of ids) {
    const row = (await conn
      .prepare("SELECT search_text FROM entity_snapshots WHERE entity_id = ?")
      .get(id)) as { search_text: string | null } | undefined;
    if (row && row.search_text == null) n += 1;
  }
  return n;
}

async function run(params: Parameters<typeof lexicalSearchEntityIds>[0]) {
  const readTrace: EntityReadTrace = { reasons: new Set() };
  const result = await lexicalSearchEntityIds({ ...params, readTrace });
  return {
    entityIds: result.entityIds,
    total: result.total,
    strategies: [...result.strategies].sort(),
    rowsLoaded: readTrace.lexical_rows_loaded ?? -1,
  };
}

async function cleanup(): Promise<void> {
  for (let i = 0; i < created.length; i += 500) {
    const chunk = created.slice(i, i + 500);
    await db.from("raw_fragments").delete().in("entity_id", chunk);
    await db.from("entity_snapshots").delete().in("entity_id", chunk);
    await db.from("entities").delete().in("id", chunk);
  }
  created.length = 0;
}

const fixtureIds: string[] = [];

describe("lexical search SQL candidate filter", () => {
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    const id = (name: string) => `ent_lexsql_${RUN}_${name}`;
    const fixtures: Array<Parameters<typeof addEntity>[0]> = [
      {
        id: id("email"),
        entityType: "contact",
        canonicalName: "Synthetic Person",
        snapshot: { email: "synth.person@example.com", city: "Fernwick" },
      },
      {
        id: id("email_null"),
        entityType: "contact",
        canonicalName: "Second Synthetic Person",
        snapshot: { email: "synth.person@example.org" },
      },
      {
        id: id("hyphen"),
        entityType: NOTE,
        canonicalName: "alpha-beta_gamma fernwick report",
        snapshot: { title: "Alpha-Beta Gamma" },
      },
      {
        id: id("frag_string"),
        entityType: NOTE,
        canonicalName: "untitled note one",
        snapshot: { title: "Untitled" },
        fragments: [{ key: "venue_name", value: "Quartzhollow Annex" }],
      },
      {
        id: id("frag_object"),
        entityType: NOTE,
        canonicalName: "untitled note two",
        snapshot: { title: "Untitled" },
        fragments: [{ key: "details", value: { venue: "Quartzhollow Annex", floor: 3 } }],
      },
      {
        id: id("merged_target"),
        entityType: NOTE,
        canonicalName: "ravelstone merge target",
        snapshot: { title: "Ravelstone" },
      },
      {
        id: id("merged_source"),
        entityType: NOTE,
        canonicalName: "ravelstone merge source",
        snapshot: { title: "Ravelstone" },
        mergedTo: id("merged_target"),
      },
      {
        id: id("bookkeeping"),
        entityType: "conversation",
        canonicalName: "ravelstone chat",
        snapshot: { title: "Ravelstone chat about fernwick" },
      },
      {
        id: id("plan"),
        entityType: "plan",
        canonicalName: "Zephyrine launch",
        snapshot: { title: "Zephyrine launch" },
      },
      {
        id: id("plan_other"),
        entityType: NOTE,
        canonicalName: "zephyrine plan note",
        snapshot: { title: "Zephyrine plan" },
      },
      {
        id: id("partial"),
        entityType: NOTE,
        canonicalName: "orchard ledger summary",
        snapshot: { title: "Orchard ledger summary" },
      },
      {
        id: id("partial_null"),
        entityType: NOTE,
        canonicalName: "orchard ledger draft",
        snapshot: { title: "Orchard ledger draft" },
      },
      {
        id: id("concept"),
        entityType: "financial_account",
        canonicalName: "vellumbank regular",
        snapshot: { institution: "Vellumbank", provider: "Wispline" },
      },
    ];
    for (const fixture of fixtures) {
      await addEntity(fixture);
      fixtureIds.push(fixture.id);
    }
    keepNull.add(id("email_null"));
    keepNull.add(id("partial_null"));

    // Bulk: 2,000 rows of one type, exactly one carrying the search word.
    const bulkRows = Array.from({ length: 2000 }, (_, i) => ({
      id: `ent_lexsql_${RUN}_bulk_${String(i).padStart(5, "0")}`,
      user_id: USER,
      entity_type: BULK,
      canonical_name: i === 1234 ? "bulk row lanternquay" : `bulk row ${i}`,
    }));
    const now = new Date().toISOString();
    for (let i = 0; i < bulkRows.length; i += 200) {
      const chunk = bulkRows.slice(i, i + 200);
      await serviceRoleClient.from("entities").insert(chunk);
      created.push(...chunk.map((r) => r.id));
      await serviceRoleClient.from("entity_snapshots").insert(
        chunk.map((r) => ({
          entity_id: r.id,
          user_id: USER,
          entity_type: BULK,
          schema_version: "1.0",
          canonical_name: r.canonical_name,
          snapshot: { title: r.canonical_name, body: "routine synthetic content" },
          provenance: {},
          observation_count: 1,
          last_observation_at: now,
          computed_at: now,
        }))
      );
    }
    await fillSearchText(bulkRows.map((r) => r.id));
  }, 180_000);

  afterAll(async () => {
    await cleanup();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const cases: Array<{ name: string; params: Omit<Parameters<typeof run>[0], "userId"> }> = [
    { name: "email punctuation", params: { search: "synth.person@example.com" } },
    { name: "email prefix hits NULL row too", params: { search: "synth.person@example" } },
    { name: "hyphen and underscore", params: { search: "alpha beta gamma" } },
    { name: "hyphen query form", params: { search: "alpha-beta_gamma", entityType: NOTE } },
    { name: "fragment-only string and object", params: { search: "quartzhollow annex" } },
    { name: "fragment-only typed", params: { search: "quartzhollow", entityType: NOTE } },
    { name: "merged excluded", params: { search: "ravelstone" } },
    { name: "merged included", params: { search: "ravelstone", includeMerged: true } },
    {
      name: "bookkeeping excluded",
      params: { search: "ravelstone", excludeBookkeeping: true },
    },
    { name: "bookkeeping words", params: { search: "fernwick", excludeBookkeeping: false } },
    { name: "type-name word", params: { search: "zephyrine plans" } },
    { name: "type-name word alone", params: { search: "plan" } },
    {
      name: "partial overlap",
      params: { search: "orchard ledger quarterly reconciliation summary" },
    },
    { name: "concept bridge", params: { search: "bank account vellumbank wispline" } },
    { name: "no match at all", params: { search: "nonexistentword anotherone" } },
    { name: "multi-type filter", params: { search: "ravelstone", entityTypes: [NOTE, "conversation"] } },
  ];

  for (const testCase of cases) {
    it(`parity: ${testCase.name}`, async () => {
      const params = { ...testCase.params, userId: USER };
      await fillSearchText(fixtureIds);
      expect(await nullCount(fixtureIds)).toBe(keepNull.size);
      const filtered = await run(params);

      await nullSearchText(fixtureIds);
      expect(await nullCount(fixtureIds)).toBe(fixtureIds.length);
      const oldPath = await run(params);

      expect(filtered.entityIds).toEqual(oldPath.entityIds);
      expect(filtered.total).toBe(oldPath.total);
      expect(filtered.strategies).toEqual(oldPath.strategies);
      expect(filtered.rowsLoaded).toBeLessThanOrEqual(oldPath.rowsLoaded);
    });
  }

  it("parity cases are not vacuous", async () => {
    await fillSearchText(fixtureIds);
    const id = (name: string) => `ent_lexsql_${RUN}_${name}`;
    expect((await run({ userId: USER, search: "synth.person@example.com" })).entityIds).toEqual([
      id("email"),
    ]);
    const fragments = await run({ userId: USER, search: "quartzhollow annex" });
    expect([...fragments.entityIds].sort()).toEqual([id("frag_object"), id("frag_string")]);
    expect((await run({ userId: USER, search: "ravelstone" })).entityIds).not.toContain(
      id("merged_source")
    );
    expect(
      (await run({ userId: USER, search: "ravelstone", excludeBookkeeping: true })).entityIds
    ).not.toContain(id("bookkeeping"));
    const partial = await run({
      userId: USER,
      search: "orchard ledger quarterly reconciliation summary",
    });
    expect(partial.entityIds).toContain(id("partial"));
    expect(partial.strategies).toContain("partial_overlap");
    const concept = await run({ userId: USER, search: "bank account vellumbank wispline" });
    expect(concept.entityIds).toContain(id("concept"));
    expect(concept.strategies).toContain("concept_bridge");
  });

  it("a rename NULLs the stored text (brief 1 trigger) and the row is found by its new name", async () => {
    await fillSearchText(fixtureIds);
    const target = `ent_lexsql_${RUN}_hyphen`;
    const conn = await getDb();
    await conn
      .prepare("UPDATE entities SET canonical_name = ? WHERE id = ?")
      .run("cobaltmere renamed report", target);
    try {
      expect(await nullCount([target])).toBe(1);
      const renamed = await run({ userId: USER, search: "cobaltmere" });
      expect(renamed.entityIds).toEqual([target]);
    } finally {
      await conn
        .prepare("UPDATE entities SET canonical_name = ? WHERE id = ?")
        .run("alpha-beta_gamma fernwick report", target);
    }
  });

  it("a selective search over 2,000 rows loads about one row", async () => {
    const filtered = await run({ userId: USER, entityType: BULK, search: "lanternquay" });
    expect(filtered.total).toBe(1);
    expect(filtered.rowsLoaded).toBeGreaterThanOrEqual(1);
    expect(filtered.rowsLoaded).toBeLessThanOrEqual(5);
  });

  it("REST POST /entities/query and MCP retrieve_entities agree with the service call", async () => {
    const id = (name: string) => `ent_lexsql_${RUN}_nil_${name}`;
    await addEntity({
      id: id("a"),
      userId: NIL_USER,
      entityType: NOTE,
      canonicalName: "marigoldvane alpha",
      snapshot: { title: "Marigoldvane alpha" },
    });
    await addEntity({
      id: id("b"),
      userId: NIL_USER,
      entityType: NOTE,
      canonicalName: "other row",
      snapshot: { title: "other" },
      fragments: [{ key: "detail", value: { place: "Marigoldvane" } }],
    });
    await addEntity({
      id: id("c"),
      userId: NIL_USER,
      entityType: NOTE,
      canonicalName: "unrelated",
      snapshot: { title: "unrelated" },
    });
    await fillSearchText([id("a"), id("c")]);

    const service = await queryEntitiesWithCount({
      userId: NIL_USER,
      entityType: NOTE,
      search: "marigoldvane",
      limit: 25,
      offset: 0,
    });
    const serviceIds = service.entities.map((e) => e.entity_id);
    expect([...serviceIds].sort()).toEqual([id("a"), id("b")]);

    const res = await fetch(`http://127.0.0.1:${API_PORT}/entities/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity_type: NOTE,
        search: "marigoldvane",
        limit: 25,
        user_id: NIL_USER,
      }),
    });
    expect(res.status).toBe(200);
    const rest = (await res.json()) as { entities: Array<{ entity_id: string }>; total: number };
    expect(rest.entities.map((e) => e.entity_id)).toEqual(serviceIds);
    expect(rest.total).toBe(service.total);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpServer = new NeotomaServer();
    (mcpServer as unknown as { authenticatedUserId: string }).authenticatedUserId = NIL_USER;
    const client = new Client({ name: "lexical-sql-filter", version: "1.0.0" }, { capabilities: {} });
    await Promise.all([
      (
        mcpServer as unknown as {
          mcpServer: { server: { connect: (t: unknown) => Promise<void> } };
        }
      ).mcpServer.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const result = (await client.callTool({
        name: "retrieve_entities",
        arguments: { entity_type: NOTE, search: "marigoldvane", limit: 25 },
      })) as { content: Array<{ type: string; text: string }> };
      const body = JSON.parse(result.content[0].text) as {
        entities: Array<{ entity_id: string }>;
        total: number;
      };
      expect(body.entities.map((e) => e.entity_id)).toEqual(serviceIds);
      expect(body.total).toBe(service.total);
    } finally {
      await client.close();
    }
  });
});
