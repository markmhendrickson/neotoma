/**
 * The reserved `agent_capability_v1` shape is declared in the contract but
 * confers no authority in this build.
 *
 * Runs the real HTTP app and the MCP server against the SQLite store. What is
 * pinned, surface by surface:
 *
 *   - REFUSED at write (the grant validator rejects a v1 entry):
 *       POST /agents/grants, PATCH /agents/grants/:id, POST /store,
 *       POST /correct, MCP `correct`.
 *   - NOT refused at write: MCP `store` (structured path). It inserts the
 *     observation directly and does not call the validator, so a v1-shaped
 *     `agent_grant` entity can be persisted there. That gap is pre-existing
 *     and tracked for the deep-guard change; this file deliberately does not
 *     pin "it persists" (that would ratify the gap). It pins the invariant
 *     that matters today: whether or not such an entity exists, it resolves
 *     to NO authority, because every read re-validates and fails closed.
 *
 * A legacy-shaped grant must keep behaving exactly as before, including
 * ignoring the reserved validity fields on the grants routes.
 */

import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import {
  clearGrantCacheForTests,
  getGrant,
  listGrantsForUser,
  lookupGrantForIdentity,
} from "../../src/services/agent_grants.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupTestEntities } from "../helpers/cleanup_helpers.js";

const OWNER = LOCAL_DEV_USER_ID;
const LEGACY_CAPS = [{ op: "retrieve", entity_types: ["task"] }];
let apiBase = "";

function thumbprint(): string {
  return randomBytes(32).toString("base64url");
}

function v1Capability(): Record<string, unknown> {
  return {
    op: "agent_capability_v1",
    capability_id: "cap-1",
    purpose: { name: "example_purpose", version: "1" },
    delegation_chain: [],
    param_constraints: {
      contract_version: 1,
      operation_ids: ["store"],
      owner: { user_id: OWNER },
      source_bytes: [{ sha256: "a".repeat(64), byte_length: 12, mime_type: "text/plain" }],
      sources: [],
      entities: {
        entity_type: "configuration",
        composite: { system: "example", key: "example" },
        bound_fields: { schema_version: 1 },
        max_observations: 10,
      },
    },
  };
}

async function send(path: string, body: unknown, method = "POST") {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

async function pinnedBy(tp: string) {
  const grants = await listGrantsForUser(OWNER, { status: "all" });
  return grants.filter((g) => g.match_thumbprint === tp);
}

type McpResult = { content: Array<{ text: string }> };

function callTool(
  server: NeotomaServer,
  name: "store" | "correct",
  params: Record<string, unknown>
) {
  return (server as unknown as Record<string, (p: Record<string, unknown>) => Promise<McpResult>>)[
    name
  ](params);
}

describe("agent_capability_v1 is declared but confers no authority", () => {
  let httpServer: ReturnType<typeof createServer>;
  let server: NeotomaServer;
  const created: string[] = [];

  /** Record any grant a v1 attempt unexpectedly created so cleanup still sees it. */
  async function sweep(tp: string) {
    for (const g of await pinnedBy(tp).catch(() => [])) created.push(g.grant_id);
  }

  async function legacyGrant(label: string, tp = thumbprint()) {
    const made = await send("/agents/grants", {
      label,
      capabilities: LEGACY_CAPS,
      match_thumbprint: tp,
    });
    expect(made.status).toBe(201);
    const grantId = made.body.grant.grant_id as string;
    created.push(grantId);
    return { grantId, tp };
  }

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = OWNER;
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("no listen address");
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    clearGrantCacheForTests();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupTestEntities(created);
  });

  it("POST /agents/grants refuses a v1 capability and creates nothing", async () => {
    const tp = thumbprint();
    const { status, body } = await send("/agents/grants", {
      label: "v1-create",
      capabilities: [v1Capability()],
      match_thumbprint: tp,
      match_sub: "agent@example.com",
      match_iss: "https://agent.example.com",
      valid_from: "2030-01-01T00:00:00Z",
      valid_until: "2031-01-01T00:00:00Z",
    });
    await sweep(tp);

    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("agent_grant_invalid");
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    expect(await pinnedBy(tp)).toHaveLength(0);
  });

  it("PATCH /agents/grants/:id refuses a v1 capability and leaves the grant unchanged", async () => {
    const { grantId } = await legacyGrant("legacy-for-patch");

    const { status, body } = await send(
      `/agents/grants/${grantId}`,
      { capabilities: [v1Capability()] },
      "PATCH"
    );

    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("agent_grant_invalid");
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    expect((await getGrant(OWNER, grantId))?.capabilities).toEqual(LEGACY_CAPS);
  });

  it("POST /store refuses an agent_grant entity carrying a v1 capability", async () => {
    const tp = thumbprint();
    const { status, body } = await send("/store", {
      idempotency_key: `v1-inert-store-${randomUUID()}`,
      entities: [
        {
          entity_type: "agent_grant",
          label: "v1-store",
          status: "active",
          capabilities: [v1Capability()],
          match_thumbprint: tp,
        },
      ],
    });
    await sweep(tp);

    // The status is not pinned (it is 500 today); the body anchor and the
    // absence of a stored grant are the contract.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    expect(await pinnedBy(tp)).toHaveLength(0);
  });

  it("POST /correct refuses a v1 capability on a legacy grant and leaves it unchanged", async () => {
    const { grantId } = await legacyGrant("legacy-for-correct");

    const { status, body } = await send("/correct", {
      entity_id: grantId,
      entity_type: "agent_grant",
      field: "capabilities",
      value: [v1Capability()],
      idempotency_key: `v1-inert-correct-${randomUUID()}`,
    });

    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("agent_grant_invalid");
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    expect((await getGrant(OWNER, grantId))?.capabilities).toEqual(LEGACY_CAPS);
  });

  it("MCP correct refuses a v1 capability on a legacy grant and leaves it unchanged", async () => {
    const { grantId } = await legacyGrant("legacy-for-mcp-correct");

    await expect(
      callTool(server, "correct", {
        user_id: OWNER,
        entity_id: grantId,
        entity_type: "agent_grant",
        field: "capabilities",
        value: [v1Capability()],
        idempotency_key: `v1-inert-mcp-correct-${randomUUID()}`,
      })
    ).rejects.toThrow(/capabilities\[0\]\.op/);
    expect((await getGrant(OWNER, grantId))?.capabilities).toEqual(LEGACY_CAPS);
  });

  it("MCP store: a v1-shaped agent_grant, persisted or not, resolves to no authority", async () => {
    const tp = thumbprint();
    let storedEntityId: string | null = null;
    try {
      const result = await callTool(server, "store", {
        user_id: OWNER,
        idempotency_key: `v1-inert-mcp-store-${randomUUID()}`,
        commit: true,
        entities: [
          {
            entity_type: "agent_grant",
            label: "v1-mcp-store",
            status: "active",
            capabilities: [v1Capability()],
            match_thumbprint: tp,
            match_sub: "agent@example.com",
            match_iss: "https://agent.example.com",
          },
        ],
      });
      const parsed = JSON.parse(result.content[0].text) as Record<string, any>;
      storedEntityId = (parsed.entities?.[0]?.entity_id as string | undefined) ?? null;
      if (storedEntityId) created.push(storedEntityId);
    } catch {
      // A build that refuses the write at this surface satisfies the invariant too.
    }

    // The invariant: no key-bound grant is resolved for this key.
    clearGrantCacheForTests();
    const lookup = await lookupGrantForIdentity({
      sub: "agent@example.com",
      iss: "https://agent.example.com",
      thumbprint: tp,
    });
    expect(lookup.grant).toBeNull();
    expect(lookup.inactive_grant).toBeNull();
    if (storedEntityId) {
      // Persisted: the read side fails closed on it rather than parsing the v1 entry.
      expect(lookup.invalid_grant_id).toBe(storedEntityId);
      await expect(getGrant(OWNER, storedEntityId)).rejects.toThrow(/capabilities\[0\]\.op/);
    }
  });

  it("a legacy-shaped grant still creates unchanged and the reserved validity fields are ignored", async () => {
    const tp = thumbprint();
    const { status, body } = await send("/agents/grants", {
      label: "legacy-create",
      capabilities: LEGACY_CAPS,
      match_thumbprint: tp,
      valid_from: "2030-01-01T00:00:00Z",
      valid_until: "2031-01-01T00:00:00Z",
    });

    expect(status).toBe(201);
    created.push(body.grant.grant_id as string);
    expect(body.grant.capabilities).toEqual(LEGACY_CAPS);
    expect(body.grant.match_thumbprint).toBe(tp);
    // The grants routes pick known fields only, so the reserved fields are dropped.
    expect(body.grant).not.toHaveProperty("valid_from");
    expect(body.grant).not.toHaveProperty("valid_until");
    const stored = await getGrant(OWNER, body.grant.grant_id as string);
    expect(stored).not.toHaveProperty("valid_from");
    expect(stored).not.toHaveProperty("valid_until");
  });

  it("raw /store of valid_from follows the ACTIVE schema: stored verbatim on 1.1.0, dropped before", async () => {
    const tp = thumbprint();
    const garbage = "not-a-date";
    const { status, body } = await send("/store", {
      idempotency_key: `v1-inert-validity-${randomUUID()}`,
      entities: [
        {
          entity_type: "agent_grant",
          label: "legacy-with-validity",
          status: "active",
          capabilities: LEGACY_CAPS,
          match_thumbprint: tp,
          valid_from: garbage,
        },
      ],
    });
    expect(status).toBeLessThan(300);
    const entityId = body.structured?.entities?.[0]?.entity_id ?? body.entities?.[0]?.entity_id;
    expect(typeof entityId).toBe("string");
    created.push(entityId);

    const active = await schemaRegistry.loadActiveSchema("agent_grant");
    const declared = Boolean(active?.schema_definition.fields.valid_from);
    const snapshot = (await getEntityWithProvenance(entityId))?.snapshot ?? {};
    if (declared) {
      // The field is declared as a plain string, so the value is kept exactly as
      // sent and is NOT validated here (validation belongs to the v1 validator).
      expect(snapshot.valid_from).toBe(garbage);
    } else {
      expect(snapshot).not.toHaveProperty("valid_from");
    }
    // Either way nothing reads the field: the grant is still an ordinary legacy grant.
    expect((await getGrant(OWNER, entityId))?.capabilities).toEqual(LEGACY_CAPS);
  });
});
