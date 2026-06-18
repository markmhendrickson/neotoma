/**
 * Contract + integration coverage for the GET /entities REST alias (#1499).
 *
 * `GET /entities?entity_type=...&search=...` MUST map its query string to the
 * same handler as `POST /entities/query` and return the same result set, so
 * consumers (daemons) that issue the intuitive GET no longer hit a 404 and
 * silently degrade. Unmatched verbs on the bare collection path MUST return a
 * hinted 404 that points back at the canonical endpoints so the misuse is
 * self-correcting.
 *
 * Uses the shared HTTP server started by vitest.global_setup.ts (local SQLite
 * backend, local-dev user-id override honored for the seeded user_id).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";

const PORT = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ENTITY_TYPE = "agent_definition";

const userId = randomUUID();
const marker = `getalias_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const canonicalName = `Daemon Sync Agent ${marker}`;
const createdEntityIds: string[] = [];

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function entityIds(json: any): string[] {
  return (json.entities ?? []).map((e: any) => e.entity_id ?? e.id).sort();
}

describe("GET /entities alias (#1499)", () => {
  beforeAll(async () => {
    const { status, json } = await post("/store", {
      user_id: userId,
      idempotency_key: marker,
      commit: true,
      entities: [{ entity_type: ENTITY_TYPE, canonical_name: canonicalName }],
    });
    expect(status).toBe(200);
    const stored = (json.entities ?? [])[0] as { entity_id?: string } | undefined;
    if (stored?.entity_id) createdEntityIds.push(stored.entity_id);
  });

  afterAll(async () => {
    for (const id of createdEntityIds) {
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  it("returns 200 with the same results as the equivalent POST /entities/query", async () => {
    const search = marker;
    const getRes = await get(
      `/entities?entity_type=${ENTITY_TYPE}&search=${search}&user_id=${userId}`
    );
    const postRes = await post("/entities/query", {
      entity_type: ENTITY_TYPE,
      search,
      user_id: userId,
    });

    expect(getRes.status).toBe(200);
    expect(postRes.status).toBe(200);
    // Parity: identical result sets and totals from both transports.
    expect(entityIds(getRes.json)).toEqual(entityIds(postRes.json));
    expect(getRes.json.total).toBe(postRes.json.total);
    // The seeded entity is present in the GET result.
    expect(entityIds(getRes.json)).toContain(createdEntityIds[0]);
  });

  it("coerces numeric/boolean params and stays in parity with the POST handler", async () => {
    // Coerced query string vs the equivalent typed POST body must reach the
    // same handler and return identical status + echoed pagination. We compare
    // against POST rather than asserting a fixed status so the test is robust
    // to handler behavior that is shared by both transports.
    const getRes = await get(
      `/entities?entity_type=${ENTITY_TYPE}&search=${marker}&user_id=${userId}&limit=5&offset=0&include_snapshots=true`
    );
    const postRes = await post("/entities/query", {
      entity_type: ENTITY_TYPE,
      search: marker,
      user_id: userId,
      limit: 5,
      offset: 0,
      include_snapshots: true,
    });
    expect(getRes.status).toBe(postRes.status);
    expect(getRes.status).toBe(200);
    // Numeric coercion: strings "5"/"0" became integers echoed back in the body.
    expect(getRes.json.limit).toBe(5);
    expect(getRes.json.offset).toBe(0);
    expect(getRes.json.limit).toBe(postRes.json.limit);
    expect(getRes.json.offset).toBe(postRes.json.offset);
  });

  it("returns 400 for an invalid query parameter value", async () => {
    const { status, json } = await get(
      `/entities?entity_type=${ENTITY_TYPE}&user_id=${userId}&limit=not-a-number`
    );
    expect(status).toBe(400);
    expect(json.error_code).toBeDefined();
  });

  it("fires a hinted 404 for an unsupported verb on /entities", async () => {
    const res = await fetch(`${BASE_URL}/entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    expect(res.status).toBe(404);
    expect(json.error_code).toBe("RESOURCE_NOT_FOUND");
    // Structured hint lives in details, never concatenated into message.
    expect(json.details?.hint).toContain("POST /entities/query");
    expect(json.details?.supported).toContain("POST /entities/query");
  });
});
