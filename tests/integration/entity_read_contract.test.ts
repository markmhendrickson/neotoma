import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { LOCAL_DEV_USER_ID as userId } from "../../src/services/local_auth.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";

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
