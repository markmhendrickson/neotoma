import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { LOCAL_DEV_USER_ID as userId } from "../../src/services/local_auth.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";

// Only the embedding-provider boundary is synthetic; all retrieval/HTTP/MCP/DB paths are native.
vi.mock("openai", () => ({
  default: class {
    embeddings = {
      create: async () => {
        throw new Error("Synthetic unavailable embedding provider");
      },
    };
  },
}));

const entityType = "read_contract_probe_" + randomUUID().replaceAll("-", "");
const ids = Array.from({ length: 3 }, (_, i) => "ent_" + entityType + "_" + i);
let server: ReturnType<typeof createServer>, base: string;

beforeAll(async () => {
  if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest")) throw Error("Owned .vitest required");
  expect(
    (
      await db.from("entities").insert(
        ids.map((id, i) => ({
          id,
          user_id: userId,
          entity_type: entityType,
          canonical_name: "Synthetic item " + i,
        }))
      )
    ).error
  ).toBeNull();
  expect(
    (
      await db.from("entity_snapshots").insert(
        ids.map((entity_id, i) => ({
          entity_id,
          user_id: userId,
          entity_type: entityType,
          schema_version: "1.0",
          snapshot: {
            status: i < 2 ? "active" : "closed",
            canonical_key: i < 2 ? "shared" : "other",
          },
          observation_count: 0,
          last_observation_at: "2026-01-01T00:00:00Z",
          provenance: {},
        }))
      )
    ).error
  ).toBeNull();
  server = createServer(app);
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No owned loopback");
  base = "http://127.0.0.1:" + address.port;
});
afterAll(async () => {
  if (server) await new Promise<void>((ok) => server.close(() => ok()));
  await db.from("entity_snapshots").delete().in("entity_id", ids);
  await db.from("entities").delete().in("id", ids);
});

it("shared service certifies its actual positive structured predicate, with entities as count unit", async () => {
  const result = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
  expect(result.entities).toHaveLength(3);
  expect(result).toHaveProperty("read_contract.version", "1");
  const c = (result as any).read_contract;
  expect(c.mode.actual).toBe("structured");
  expect(c.applied_scope.entity_types).toEqual([entityType]);
  expect(c.coverage.returned_count).toBe(3);
  expect(c.coverage.total).toEqual({ value: 3, relation: "exact", unit: "entities" });
  expect(c.coverage.scope_exhausted).toBe(true);
  expect(c.coverage.state).toBe("complete");
  expect(c.coherence.kind).toBe("read_interval");
});
it("GET preserves an unknown raw option name and refuses to certify the requested scope", async () => {
  const response = await fetch(
    base + "/entities?entity_type=" + entityType + "&pretend_scope=private-canary-value"
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as any;
  expect(result.entities).toHaveLength(3);
  expect(result).toHaveProperty("read_contract.version", "1");
  expect(result.read_contract.request_options.ignored).toContainEqual({
    name: "pretend_scope",
    reason: "unknown_option",
  });
  expect(result.read_contract.coverage.state).toBe("partial");
  expect(JSON.stringify(result.read_contract)).not.toContain("private-canary-value");
});
it("HTTP accepted collapse is reported as unapplied instead of claiming synthesized results", async () => {
  const response = await fetch(base + "/entities/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity_type: entityType, collapse_by: "canonical_key" }),
  });
  expect(response.status).toBe(200);
  const result = (await response.json()) as any;
  expect(result.entities).toHaveLength(3);
  expect(result).toHaveProperty("read_contract.version", "1");
  expect(result.read_contract.request_options.ignored).toContainEqual({
    name: "collapse_by",
    reason: "unsupported_on_surface",
  });
  expect(result.read_contract.coverage.reasons).toContain("ignored_scope_option");
});
it("MCP collapse measures groups separately from its legacy underlying entity total", async () => {
  const response = await modernPost(base, {
    id: 1,
    method: "tools/call",
    params: {
      name: "retrieve_entities",
      arguments: { entity_type: entityType, collapse_by: "canonical_key" },
    },
  });
  const result = toolResultJson(response.body) as any;
  expect(result.entities).toHaveLength(2);
  expect(result.total).toBe(3);
  expect(result).toHaveProperty("read_contract.version", "1");
  expect(result.read_contract.coverage.kind).toBe("synthesized_groups");
  expect(result.read_contract.coverage.returned_count).toBe(2);
  expect(result.read_contract.coverage.total.unit).toBe("entities");
});
it("a full last keyset page still requires its terminal empty page", async () => {
  const first = await queryEntitiesWithCount({ userId, entityType, limit: 3 });
  expect(first.entities).toHaveLength(3);
  expect(first.next_cursor).toBeTruthy();
  expect(first).toHaveProperty("read_contract.coverage.scope_exhausted", false);
  const end = await queryEntitiesWithCount({
    userId,
    entityType,
    limit: 3,
    cursor: first.next_cursor,
  });
  expect(end.entities).toHaveLength(0);
  expect(end).toHaveProperty("read_contract.coverage.scope_exhausted", true);
});

it("a later never-observed entity prevents an exact population count even on a positive short page", async () => {
  const bare = ids[2] + "_bare";
  try {
    expect(
      (
        await db.from("entities").insert({
          id: bare,
          user_id: userId,
          entity_type: entityType,
          canonical_name: "Synthetic bare entity",
        })
      ).error
    ).toBeNull();
    const first = await queryEntitiesWithCount({ userId, entityType, limit: 1 });
    expect(first.entities).toHaveLength(1);
    expect(first.total).toBe(3); // Preserve the accepted legacy snapshot-count behavior.
    expect(first.read_contract.coverage.total.relation).toBe("unknown");
    expect(first.read_contract.coverage.reasons).toContain("count_population_unverified");
    const later = await queryEntitiesWithCount({ userId, entityType, limit: 100 });
    expect(later.entities.map((e) => e.entity_id)).toContain(bare);
    expect(later.read_contract.coverage.scope_exhausted).toBeNull();
  } finally {
    await db.from("entities").delete().eq("id", bare);
  }
});

it("collection and total explicitly disclose separate acquisitions without a common view", async () => {
  const result = await queryEntitiesWithCount({ userId, entityType, limit: 1 });
  expect(result.read_contract.coherence).toHaveProperty("common_view", false);
  expect(result.read_contract.coherence).toHaveProperty(
    "collection_and_total",
    "separate_acquisitions"
  );
});

it("equal legacy counts do not certify a different snapshot and entity membership", async () => {
  const bare = ids[2] + "_balanced_bare",
    ghost = ids[2] + "_balanced_snapshot";
  try {
    expect(
      (
        await db.from("entities").insert({
          id: bare,
          user_id: userId,
          entity_type: entityType,
          canonical_name: "Synthetic never observed",
        })
      ).error
    ).toBeNull();
    // Ordinary snapshot insertion creates its missing entity. Deliberately
    // seed inconsistent native membership below that adapter for this audit.
    await (await getDb())
      .prepare(
        "INSERT INTO entity_snapshots (entity_id,user_id,entity_type,schema_version,snapshot,provenance,observation_count) VALUES (?,?,?,?,?,?,?)"
      )
      .run(ghost, userId, entityType, "1.0", "{}", "{}", 0);
    const result = await queryEntitiesWithCount({ userId, entityType, limit: 1 });
    expect(result.total).toBe(4);
    expect(
      (
        await db
          .from("entities")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("entity_type", entityType)
      ).count
    ).toBe(4);
    expect(result.read_contract.coverage.total.relation).toBe("unknown");
    expect(result.read_contract.coverage.reasons).toContain("count_population_unverified");
  } finally {
    await db.from("entity_snapshots").delete().eq("entity_id", ghost);
    await db.from("entities").delete().eq("id", bare);
  }
});

it("bounded domain diagnostics use own/global catalog fields and never foreign private fields", async () => {
  const ownType = entityType + "_own_schema",
    foreignType = entityType + "_foreign_schema";
  const foreignOwner = randomUUID();
  const schema = (id: string, type: string, owner: string, fields: Record<string, unknown>) => ({
    id,
    entity_type: type,
    schema_version: "1.0",
    active: true,
    user_id: owner,
    scope: "user",
    schema_definition: { fields, identity_opt_out: "heuristic_canonical_name" },
    reducer_config: { merge_policies: {} },
  });
  const ownId = randomUUID(),
    foreignId = randomUUID();
  try {
    expect(
      (
        await db.from("schema_registry").insert([
          schema(ownId, ownType, userId, { status: { type: "string" } }),
          schema(foreignId, foreignType, foreignOwner, {
            foreign_private_canary: { type: "string" },
          }),
        ])
      ).error
    ).toBeNull();
    const catalog = await schemaRegistry.listActiveSchemas(userId);
    expect(catalog.map((row) => row.entity_type)).toContain(ownType);
    expect(catalog.map((row) => row.entity_type)).not.toContain(foreignType);
    expect((await db.from("schema_registry").select("id").eq("id", foreignId)).data).toHaveLength(
      1
    );
    const good = await queryEntitiesWithCount({
      userId,
      entityType: ownType,
      snapshotFilters: { status: { op: "eq", value: "active" } },
    });
    expect(good.read_contract.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "missing_field", field: "status" })
    );
    const missing = await queryEntitiesWithCount({
      userId,
      entityType: ownType,
      snapshotFilters: { absent_field: { op: "eq", value: "private-value" } },
    });
    expect(missing.read_contract.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing_field",
        field: "absent_field",
        entity_type: ownType,
      })
    );
    const hidden = await queryEntitiesWithCount({
      userId,
      entityType: foreignType,
      snapshotFilters: { foreign_private_canary: { op: "eq", value: "private-value" } },
    });
    expect(hidden.read_contract.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing_entity_type", entity_type: foreignType })
    );
    expect(JSON.stringify(hidden.read_contract.diagnostics)).not.toContain(
      "foreign_private_canary"
    );
    expect(JSON.stringify(hidden.read_contract)).not.toContain("private-value");
  } finally {
    await db.from("schema_registry").delete().in("id", [ownId, foreignId]);
  }
});

it("an unavailable registry is diagnostic uncertainty rather than a missing type", async () => {
  const fail = vi
    .spyOn(schemaRegistry, "listActiveSchemas")
    .mockRejectedValueOnce(new Error("synthetic catalog outage"));
  try {
    const result = await queryEntitiesWithCount({
      userId,
      entityType,
      snapshotFilters: { status: { op: "eq", value: "active" } },
    });
    expect(result.entities).toHaveLength(2);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(result.read_contract.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "diagnostics_unavailable",
        reason: "schema_registry_unavailable",
      })
    );
    expect(result.read_contract.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "missing_entity_type" })
    );
    expect(result.read_contract.coverage.reasons).toContain("schema_registry_unavailable");
    expect(result.read_contract.coverage.scope_exhausted).toBeNull();
  } finally {
    fail.mockRestore();
  }
});

it("global catalog follows resolver scope regardless owner, own overrides win, and duplicate active authority stays uncertain", async () => {
  const type = entityType + "_catalog_authority",
    hidden = entityType + "_foreign_global";
  const rowIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const definition = (field: string) => ({
    fields: { [field]: { type: "string" } },
    identity_opt_out: "heuristic_canonical_name",
  });
  const foreign = randomUUID();
  try {
    expect(
      (
        await db.from("schema_registry").insert([
          {
            id: rowIds[0],
            entity_type: type,
            schema_version: "1.0",
            active: true,
            scope: "global",
            user_id: null,
            schema_definition: definition("global_only"),
            reducer_config: { merge_policies: {} },
          },
          {
            id: rowIds[1],
            entity_type: type,
            schema_version: "2.0",
            active: true,
            scope: "user",
            user_id: userId,
            schema_definition: definition("own_only"),
            reducer_config: { merge_policies: {} },
          },
          {
            id: rowIds[2],
            entity_type: hidden,
            schema_version: "1.0",
            active: true,
            scope: "global",
            user_id: foreign,
            schema_definition: definition("hidden_global_field"),
            reducer_config: { merge_policies: {} },
          },
        ])
      ).error
    ).toBeNull();
    const unscoped = await schemaRegistry.listActiveSchemas();
    expect(unscoped.map((row) => row.entity_type)).toContain(type);
    expect(unscoped.map((row) => row.entity_type)).toContain(hidden);
    const scoped = await schemaRegistry.listActiveSchemas(userId);
    expect(scoped.filter((row) => row.entity_type === type)).toHaveLength(2);
    expect(scoped.map((row) => row.entity_type)).toContain(hidden);
    const authoritative = await schemaRegistry.loadActiveSchema(hidden, userId);
    expect(authoritative?.id).toBe(rowIds[2]);
    expect(authoritative?.schema_definition.fields).toHaveProperty("hidden_global_field");
    const existingGlobal = await queryEntitiesWithCount({
      userId,
      entityType: hidden,
      snapshotFilters: { hidden_global_field: { op: "eq", value: "synthetic" } },
    });
    expect(existingGlobal.read_contract.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "missing_entity_type" })
    );
    expect(existingGlobal.read_contract.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "missing_field" })
    );
    const removed = await queryEntitiesWithCount({
      userId,
      entityType: type,
      snapshotFilters: { global_only: { op: "eq", value: "synthetic" } },
    });
    expect(removed.read_contract.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing_field", field: "global_only" })
    );
    expect(
      (
        await db.from("schema_registry").insert({
          id: rowIds[3],
          entity_type: type,
          schema_version: "3.0",
          active: true,
          scope: "user",
          user_id: userId,
          schema_definition: definition("different_own"),
          reducer_config: { merge_policies: {} },
        })
      ).error
    ).toBeNull();
    const ambiguous = await queryEntitiesWithCount({
      userId,
      entityType: type,
      snapshotFilters: { own_only: { op: "eq", value: "synthetic" } },
    });
    expect(ambiguous.read_contract.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "diagnostics_unavailable",
        reason: "ambiguous_or_invalid_active_schema",
      })
    );
    expect(ambiguous.read_contract.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "missing_field" })
    );
  } finally {
    await db.from("schema_registry").delete().in("id", rowIds);
  }
});

it("actual unavailable embedding fallback declares its reason and never certifies ranked absence", async () => {
  const result = await queryEntitiesWithCount({
    userId,
    entityType,
    search: "Synthetic item",
    limit: 100,
  });
  expect(result.entities).toHaveLength(3);
  expect(result.search_mode).toBe("lexical_fallback");
  expect(result.read_contract.mode.fallback_reason).toBe("embedding_unavailable");
  expect(result.read_contract.coverage.kind).toBe("lexical_candidates");
  expect(result.read_contract.coverage.scope_exhausted).toBeNull();
  expect(result.read_contract.applied_scope.ordering.field).toBe("search_rank");
});
it("non-keyset ordering never turns a short page into whole-scope absence", async () => {
  const result = await queryEntitiesWithCount({
    userId,
    entityType,
    sortBy: "canonical_name",
    limit: 100,
  });
  expect(result.entities).toHaveLength(3);
  expect(result.read_contract.coverage.state).toBe("unknown");
  expect(result.read_contract.coverage.scope_exhausted).toBeNull();
  expect(result.read_contract.coverage.continuation.kind).toBe("unsupported");
});
it("collapsed page-local groups do not certify exhaustion of globally synthesized groups", async () => {
  const response = await modernPost(base, {
    id: 2,
    method: "tools/call",
    params: {
      name: "retrieve_entities",
      arguments: { entity_type: entityType, collapse_by: "canonical_key", limit: 1 },
    },
  });
  const result = toolResultJson(response.body) as any;
  expect(result.entities).toHaveLength(1);
  expect(result.read_contract.coverage.kind).toBe("synthesized_groups");
  expect(result.read_contract.coverage.state).toBe("unknown");
  expect(result.read_contract.coverage.scope_exhausted).toBeNull();
});

it("the actual 10000-row filtered count is a lower bound even when a later positive page exists", async () => {
  const capType = entityType + "_countcap";
  const capIds = Array.from(
    { length: 10001 },
    (_, i) => "ent_" + capType + "_" + String(i).padStart(5, "0")
  );
  try {
    for (let at = 0; at < capIds.length; at += 128) {
      const batch = capIds.slice(at, at + 128);
      expect(
        (
          await db.from("entities").insert(
            batch.map((id) => ({
              id,
              user_id: userId,
              entity_type: capType,
              canonical_name: "Synthetic count cap",
            }))
          )
        ).error
      ).toBeNull();
      expect(
        (
          await db.from("entity_snapshots").insert(
            batch.map((entity_id) => ({
              entity_id,
              user_id: userId,
              entity_type: capType,
              schema_version: "1.0",
              snapshot: { status: "active" },
              observation_count: 0,
              last_observation_at: "2026-01-01T00:00:00Z",
              provenance: {},
            }))
          )
        ).error
      ).toBeNull();
    }
    const result = await queryEntitiesWithCount({
      userId,
      entityType: capType,
      snapshotFilters: { status: { op: "eq", value: "active" } },
      limit: 1,
      offset: 10000,
    });
    expect(result.entities.map((e) => e.entity_id)).toEqual([capIds[10000]]);
    expect(result.total).toBe(10000);
    expect(result.read_contract.coverage.total.relation).toBe("lower_bound");
    expect(result.read_contract.coverage.state).toBe("truncated");
    expect(result.read_contract.coverage.scope_exhausted).toBeNull();
    expect(result.read_contract.coverage.reasons).toContain("count_cap");
  } finally {
    await db.from("entity_snapshots").delete().eq("entity_type", capType).eq("user_id", userId);
    await db.from("entities").delete().eq("entity_type", capType).eq("user_id", userId);
  }
}, 60000);

it("actual untyped lexical acquisition reports its 5000 ceiling instead of certifying a missed positive absent", async () => {
  const capType = entityType + "_lexcap";
  const prefix = "ent_000_" + randomUUID().replaceAll("-", "");
  const capIds = Array.from({ length: 5001 }, (_, i) => prefix + "_" + String(i).padStart(5, "0"));
  const needle = "searchneedle" + randomUUID().replaceAll("-", "");
  try {
    for (let at = 0; at < capIds.length; at += 128) {
      const batch = capIds.slice(at, at + 128);
      expect(
        (
          await db.from("entities").insert(
            batch.map((id, j) => ({
              id,
              user_id: userId,
              entity_type: capType,
              canonical_name: at + j === 5000 ? needle : "Synthetic lexical filler",
            }))
          )
        ).error
      ).toBeNull();
      expect(
        (
          await db.from("entity_snapshots").insert(
            batch.map((entity_id) => ({
              entity_id,
              user_id: userId,
              entity_type: capType,
              schema_version: "1.0",
              snapshot: {},
              observation_count: 0,
              last_observation_at: "2026-01-01T00:00:00Z",
              provenance: {},
            }))
          )
        ).error
      ).toBeNull();
    }
    const broad = await queryEntitiesWithCount({ userId, search: needle, limit: 100 });
    expect(broad.entities).toHaveLength(0);
    expect(broad.read_contract.coverage.state).toBe("truncated");
    expect(broad.read_contract.coverage.reasons).toContain("candidate_cap");
    expect(broad.read_contract.coverage.scope_exhausted).toBeNull();
    const positive = await queryEntitiesWithCount({
      userId,
      entityType: capType,
      search: needle,
      limit: 100,
    });
    expect(positive.entities.map((e) => e.entity_id)).toEqual([capIds[5000]]);
    expect(positive.read_contract.coverage.reasons).not.toContain("candidate_cap");
    expect(positive.read_contract.coverage.scope_exhausted).toBeNull();
  } finally {
    await db.from("entity_snapshots").delete().eq("entity_type", capType).eq("user_id", userId);
    await db.from("entities").delete().eq("entity_type", capType).eq("user_id", userId);
  }
}, 60000);

it("snapshot-driven acquisition reports the actual ordering rather than the accepted requested order", async () => {
  const result = await queryEntitiesWithCount({
    userId,
    entityType,
    snapshotFilters: { status: { op: "eq", value: "active" } },
    sortBy: "canonical_name",
    sortOrder: "desc",
    limit: 100,
  });
  expect(result.entities.map((e) => e.entity_id)).toEqual(ids.slice(0, 2));
  expect(result.read_contract.applied_scope.ordering).toEqual({
    field: "entity_id",
    direction: "asc",
    tie_breaker: "entity_id",
  });
  expect(result.read_contract.coverage.reasons).toContain("requested_ordering_unapplied");
  expect(result.read_contract.coverage.scope_exhausted).toBeNull();
});
it("a legacy cursor emitted from a filtered scan is not certified as a supported keyset continuation", async () => {
  const result = await queryEntitiesWithCount({
    userId,
    entityType,
    snapshotFilters: { status: { op: "eq", value: "active" } },
    limit: 1,
  });
  expect(result.entities).toHaveLength(1);
  expect(result.next_cursor).toBeTruthy();
  expect(result.read_contract.coverage.continuation.kind).toBe("unsupported");
  expect(result.read_contract.coverage.scope_exhausted).toBeNull();
});

it("built CLI list and natural operation requests retain the actual full acquisition envelope", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const binary = path.join(root, "dist/cli/bootstrap.js");
  await access(binary);
  const cwd = path.join(root, ".vitest", "retrieval-cli");
  await mkdir(cwd, { recursive: true });
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "test",
    NEOTOMA_ENV: "development",
    NEOTOMA_DATA_DIR: process.env.NEOTOMA_DATA_DIR,
    NODE_OPTIONS:
      "--require " + JSON.stringify(path.join(root, "tests/helpers/owned_loopback_only.cjs")),
  };
  const command = async (args: string[]) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [binary, "--api-only", "--base-url", base, "--json", "--no-log-file", ...args],
      { cwd, env, timeout: 15000, maxBuffer: 1024 * 1024 }
    );
    return JSON.parse(stdout) as any;
  };
  const listed = await command(["entities", "list", "--type", entityType]);
  expect(listed.entities.map((row: any) => row.entity_id).sort()).toEqual([...ids].sort());
  expect(listed.read_contract.version).toBe("1");
  expect(listed.read_contract.coverage.returned_count).toBe(3);
  const queried = await command([
    "request",
    "--operation",
    "queryEntities",
    "--skip-auth",
    "--body",
    JSON.stringify({ entity_type: entityType, unapplied_fixture_scope: "value-must-not-echo" }),
  ]);
  expect(queried.entities).toHaveLength(3);
  expect(queried.read_contract.request_options.ignored).toContainEqual({
    name: "unapplied_fixture_scope",
    reason: "unknown_option",
  });
  expect(queried.read_contract.coverage.state).toBe("partial");
  expect(JSON.stringify(queried.read_contract)).not.toContain("value-must-not-echo");
  const get = await command([
    "request",
    "--operation",
    "listEntities",
    "--skip-auth",
    "--query",
    JSON.stringify({ entity_type: entityType, limit: 3 }),
  ]);
  expect(get.read_contract.coverage.scope_exhausted).toBe(false);
  expect(get.read_contract.coverage.continuation.next_cursor).toBeTruthy();
}, 60000);

it("executed derived type restriction and explicit bookkeeping override describe the actual lexical scope", async () => {
  const suffix = randomUUID(),
    plan = "ent_contract_plan_" + suffix,
    conversation = "ent_contract_conversation_" + suffix;
  const marker = "marker" + suffix.replaceAll("-", "");
  const rows = [
    { id: plan, user_id: userId, entity_type: "plan", canonical_name: "Synthetic " + marker },
    {
      id: conversation,
      user_id: userId,
      entity_type: "conversation",
      canonical_name: "Synthetic " + marker,
    },
  ];
  try {
    expect((await db.from("entities").insert(rows)).error).toBeNull();
    expect(
      (
        await db.from("entity_snapshots").insert(
          rows.map((row) => ({
            entity_id: row.id,
            user_id: userId,
            entity_type: row.entity_type,
            schema_version: "1.0",
            snapshot: { name: row.canonical_name },
            observation_count: 0,
            provenance: {},
          }))
        )
      ).error
    ).toBeNull();
    const typed = await queryEntitiesWithCount({ userId, search: "plan " + marker, limit: 100 });
    expect(typed.entities.map((x) => x.entity_id)).toEqual([plan]);
    expect(typed.read_contract.applied_scope.entity_types).toEqual(["plan"]);
    expect(typed.read_contract.applied_scope.predicates).toContainEqual(
      expect.objectContaining({ field: "search", op: "ranked_query" })
    );
    expect(JSON.stringify(typed.read_contract)).not.toContain(marker);
    const overridden = await queryEntitiesWithCount({
      userId,
      entityType: "conversation",
      search: marker,
      excludeBookkeeping: true,
      similarityThreshold: 1.2,
      limit: 100,
      readRequest: {
        surface: "service",
        raw: {
          entity_type: "conversation",
          search: marker,
          exclude_bookkeeping: true,
          similarity_threshold: 1.2,
        },
      },
    });
    expect(overridden.entities.map((x) => x.entity_id)).toContain(conversation);
    expect(overridden.read_contract.request_options.normalized).toContainEqual({
      name: "exclude_bookkeeping",
      canonical_name: "exclude_bookkeeping",
      reason: "explicit_bookkeeping_type_override",
    });
    expect(overridden.read_contract.request_options.ignored).toContainEqual({
      name: "similarity_threshold",
      reason: "inapplicable_mode",
    });
    expect(overridden.read_contract.applied_scope.predicates).not.toContainEqual(
      expect.objectContaining({ field: "similarity_threshold" })
    );
  } finally {
    await db.from("entity_snapshots").delete().in("entity_id", [plan, conversation]);
    await db.from("entities").delete().in("id", [plan, conversation]);
  }
});

// An absence-sensitive agent uses exact acquisition evidence; it does not turn
// this read-interval envelope into a writer fence or a historical snapshot.
async function nativeToolScan(
  args: Record<string, unknown>,
  mutate?: (page: any, index: number) => Promise<any>
) {
  const observed = new Set<string>(),
    cursors = new Set<string>();
  const pages: any[] = [];
  let cursor: string | undefined, total: number | undefined, scope: string | undefined;
  for (let at = 0; at < 10; at++) {
    const reply = await modernPost(base, {
      id: 100 + at,
      method: "tools/call",
      params: { name: "retrieve_entities", arguments: { ...args, ...(cursor ? { cursor } : {}) } },
    });
    if (reply.status !== 200) throw Error("read_failed");
    let page = toolResultJson(reply.body) as any;
    if (mutate) page = await mutate(page, at);
    const c = page.read_contract;
    if (!c || c.version !== "1" || c.surface !== "entity_collection")
      throw Error("unsupported_contract");
    if (
      c.mode.actual !== "structured" ||
      c.coverage.kind !== "predicate_population" ||
      !["complete", "paginated"].includes(c.coverage.state) ||
      c.coverage.reasons.length ||
      c.coverage.total.relation !== "exact" ||
      c.coverage.total.unit !== "entities" ||
      c.request_options.ignored.length ||
      c.coverage.returned_count !== page.entities.length
    )
      throw Error("unproved_scope");
    const shape = JSON.stringify({ ...c.applied_scope, pagination: undefined });
    if (scope !== undefined && scope !== shape) throw Error("scope_drift");
    scope = shape;
    if (total !== undefined && total !== c.coverage.total.value) throw Error("count_drift");
    total = c.coverage.total.value;
    for (const row of page.entities) {
      if (observed.has(row.entity_id)) throw Error("duplicate_entity");
      observed.add(row.entity_id);
    }
    pages.push(page);
    if (c.coverage.scope_exhausted === true) {
      if (observed.size !== total) throw Error("count_contradiction");
      return { ids: [...observed].sort(), pages, writer_fence_delivered: false };
    }
    const next = c.coverage.continuation.next_cursor;
    if (c.coverage.continuation.kind !== "cursor" || !next || cursors.has(next))
      throw Error("nonadvancing_continuation");
    cursors.add(next);
    cursor = next;
  }
  throw Error("scan_limit");
}

it("exact-tool adopting agent exhausts full final page and rejects real ignored scope, count drift, duplicates and absent proof", async () => {
  const baseline = await nativeToolScan({ entity_type: entityType, limit: 1 });
  expect(baseline.ids).toEqual([...ids].sort());
  expect(baseline.pages).toHaveLength(4);
  expect(baseline.writer_fence_delivered).toBe(false);
  expect(baseline.pages.every((page) => page.read_contract.coherence.common_view === false)).toBe(
    true
  );
  const empty = await nativeToolScan({
    entity_type: entityType,
    created_since: "2999-01-01T00:00:00Z",
    limit: 1,
  });
  expect(empty.ids).toEqual([]);
  await expect(
    nativeToolScan({
      entity_type: entityType,
      created_since: "2999-01-01T00:00:00Z",
      pretend_scope: "must-not-be-applied",
    })
  ).rejects.toThrow("unproved_scope");
  await expect(
    nativeToolScan({ entity_type: entityType, limit: 1 }, async (page) => ({
      ...page,
      read_contract: undefined,
    }))
  ).rejects.toThrow("unsupported_contract");
  let first: any;
  await expect(
    nativeToolScan({ entity_type: entityType, limit: 1 }, async (page, index) => {
      if (index === 0) {
        first = page;
        return page;
      }
      return { ...page, entities: first.entities };
    })
  ).rejects.toThrow("duplicate_entity");
  const interleave = ids[2] + "_interleaved";
  try {
    await expect(
      nativeToolScan({ entity_type: entityType, limit: 1 }, async (page, index) => {
        if (index === 0) {
          expect(
            (
              await db.from("entities").insert({
                id: interleave,
                user_id: userId,
                entity_type: entityType,
                canonical_name: "Synthetic interleave",
              })
            ).error
          ).toBeNull();
          expect(
            (
              await db.from("entity_snapshots").insert({
                entity_id: interleave,
                user_id: userId,
                entity_type: entityType,
                schema_version: "1.0",
                snapshot: {},
                observation_count: 0,
                provenance: {},
              })
            ).error
          ).toBeNull();
        }
        return page;
      })
    ).rejects.toThrow("count_drift");
  } finally {
    await db.from("entity_snapshots").delete().eq("entity_id", interleave);
    await db.from("entities").delete().eq("id", interleave);
  }
});

it("legacy derived private type scope is described by digest without exposing foreign catalog names", async () => {
  const schema = randomUUID(),
    foreign = randomUUID(),
    privateType = "Foreignscope" + randomUUID().replaceAll("-", "");
  try {
    expect(
      (
        await db.from("schema_registry").insert({
          id: schema,
          entity_type: privateType,
          schema_version: "1.0",
          scope: "user",
          user_id: foreign,
          active: true,
          schema_definition: {
            fields: { private_field: { type: "string" } },
            identity_opt_out: "heuristic_canonical_name",
          },
          reducer_config: { merge_policies: {} },
        })
      ).error
    ).toBeNull();
    expect((await db.from("schema_registry").select("id").eq("id", schema)).data).toHaveLength(1);
    const result = await queryEntitiesWithCount({
      userId,
      search: privateType.toLowerCase() + " synthetic",
      limit: 10,
    });
    expect(result.search_mode).toBe("lexical_typed");
    expect(JSON.stringify(result.read_contract)).not.toContain(privateType);
    expect(JSON.stringify(result.read_contract)).not.toContain("private_field");
    expect(result.read_contract.applied_scope.entity_types).toEqual([]);
    expect(result.read_contract.applied_scope.predicates).toContainEqual(
      expect.objectContaining({ field: "entity_type", op: "in" })
    );
    expect(result.read_contract.coverage.reasons).toContain("applied_type_scope_redacted");
    expect(result.read_contract.coverage.scope_exhausted).toBeNull();
  } finally {
    await db.from("schema_registry").delete().eq("id", schema);
  }
});

it("natural service callers retain unknown option names before interface projection", async () => {
  const result = await queryEntitiesWithCount({
    userId,
    entityType,
    limit: 100,
    unexecuted_service_scope: "value-must-not-echo",
  } as Parameters<typeof queryEntitiesWithCount>[0]);
  expect(result.entities).toHaveLength(3);
  expect(result.read_contract.request_options.applied).toContain("entity_type");
  expect(result.read_contract.request_options.ignored).toContainEqual({
    name: "unexecuted_service_scope",
    reason: "unknown_option",
  });
  expect(result.read_contract.coverage.state).toBe("partial");
  expect(JSON.stringify(result.read_contract)).not.toContain("value-must-not-echo");
});
