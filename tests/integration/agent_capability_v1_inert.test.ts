/**
 * The reserved `agent_capability_v1` shape is declared in the contract but
 * confers no authority in this build.
 *
 * Runs the real HTTP app and the MCP server against the SQLite store. What is
 * pinned, surface by surface (the same partition is documented in
 * docs/subsystems/agent_capabilities.md, "Reserved: agent_capability_v1"):
 *
 *   - REFUSED at write (the grant validator rejects a v1 entry), with the
 *     error each surface actually returns:
 *       POST /agents/grants, PATCH /agents/grants/:id, POST /correct:
 *         HTTP 400, `error_code` `AGENT_GRANT_INVALID` on the grants
 *         routes (`details.code` `agent_grant_invalid`) and
 *         `agent_grant_invalid` on /correct (`details.field`
 *         `capabilities[0].op`).
 *       POST /store: HTTP 500 `DB_QUERY_FAILED` carrying the validator message.
 *       MCP `correct`: JSON-RPC -32603 carrying the validator message, no code.
 *     The /store and MCP correct codes are the generic error path; they are
 *     asserted because the docs state them, so a fix there must update both.
 *   - NOT refused at write: MCP `store` (structured path) and MCP
 *     `create_interpretation` / POST /interpretations/create. They insert the
 *     observation directly, without the validator, so a v1-shaped
 *     `agent_grant` entity can be persisted. That gap is pre-existing and
 *     tracked for the deep-guard change; this file does not pin "it persists"
 *     (that would ratify the gap). It pins the invariant that matters today:
 *     whether or not such an entity exists, it resolves to NO authority,
 *     because every read re-validates and fails closed.
 *   - ENABLE GATE: a v1-shaped grant observation that already exists (however
 *     it got there) must still confer no authority. That test is live now and
 *     must be changed deliberately by the change that makes the validator
 *     accept v1.
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
import { db } from "../../src/db.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupTestEntities } from "../helpers/cleanup_helpers.js";

const OWNER = LOCAL_DEV_USER_ID;
const LEGACY_CAPS = [{ op: "retrieve", entity_types: ["task"] }];
let apiBase = "";

function thumbprint(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The interpretation path case-folds string values, so a mixed-case base64url
 * thumbprint would be stored as a different string and never match the key.
 * Use a lowercase one there so the test exercises a key-bound candidate.
 */
function lowercaseThumbprint(): string {
  return randomBytes(32).toString("hex");
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

/** The top-level `error_code` the route answers with. */
function codeOf(body: Record<string, any>): string | undefined {
  return body.error_code;
}

const AGENT_SUB = "agent@example.com";
const AGENT_ISS = "https://agent.example.com";

/**
 * The invariant every non-refusing surface must keep: the key resolves to no
 * grant, and a stored v1-shaped entity is rejected on read.
 */
async function expectNoAuthority(tp: string, storedEntityId: string | null) {
  clearGrantCacheForTests();
  const lookup = await lookupGrantForIdentity({ sub: AGENT_SUB, iss: AGENT_ISS, thumbprint: tp });
  expect(lookup.grant).toBeNull();
  expect(lookup.inactive_grant).toBeNull();
  if (storedEntityId) {
    expect(lookup.invalid_grant_id).toBe(storedEntityId);
    await expect(getGrant(OWNER, storedEntityId)).rejects.toThrow(/capabilities\[0\]\.op/);
  }
}

function callTool(
  server: NeotomaServer,
  name: "store" | "correct" | "createInterpretation",
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
  const createdSources: string[] = [];

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
    if (createdSources.length > 0) await db.from("sources").delete().in("id", createdSources);
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
    expect(codeOf(body)).toBe("AGENT_GRANT_INVALID");
    expect(body.details?.code).toBe("agent_grant_invalid");
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
    expect(codeOf(body)).toBe("AGENT_GRANT_INVALID");
    expect(body.details?.code).toBe("agent_grant_invalid");
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

    // The docs state this surface answers 500 DB_QUERY_FAILED (the validator
    // error falls into the generic error path, not agent_grant_invalid). Pinned
    // because the docs say so: a fix must update the docs and this line together.
    expect(status).toBe(500);
    expect(codeOf(body)).toBe("DB_QUERY_FAILED");
    expect(codeOf(body)).not.toBe("AGENT_GRANT_INVALID");
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
    // Lower-case here, upper-case on the grants routes: each is what the route returns.
    expect(codeOf(body)).toBe("agent_grant_invalid");
    expect(body.details?.field).toBe("capabilities[0].op");
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    expect((await getGrant(OWNER, grantId))?.capabilities).toEqual(LEGACY_CAPS);
  });

  it("MCP correct refuses a v1 capability on a legacy grant and leaves it unchanged", async () => {
    const { grantId } = await legacyGrant("legacy-for-mcp-correct");

    const err = await callTool(server, "correct", {
      user_id: OWNER,
      entity_id: grantId,
      entity_type: "agent_grant",
      field: "capabilities",
      value: [v1Capability()],
      idempotency_key: `v1-inert-mcp-correct-${randomUUID()}`,
    }).then(
      () => {
        throw new Error("expected MCP correct to refuse the v1 entry");
      },
      (e: unknown) => e as { code?: unknown; message?: string; data?: unknown }
    );
    // JSON-RPC internal error carrying the validator message; no agent_grant_invalid code.
    expect(err.code).toBe(-32603);
    expect(err.message).toMatch(/capabilities\[0\]\.op/);
    expect(JSON.stringify(err.data ?? "")).not.toContain("AGENT_GRANT_INVALID");
    expect((await getGrant(OWNER, grantId))?.capabilities).toEqual(LEGACY_CAPS);
  });

  it("MCP store: a v1-shaped agent_grant, persisted or refused, resolves to no authority", async () => {
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
            match_sub: AGENT_SUB,
            match_iss: AGENT_ISS,
          },
        ],
      });
      const parsed = JSON.parse(result.content[0].text) as Record<string, any>;
      storedEntityId = (parsed.entities?.[0]?.entity_id as string | undefined) ?? null;
      // Not refused: the call must have produced an entity, or this test is not exercising anything.
      expect(storedEntityId).toBeTruthy();
      created.push(storedEntityId as string);
    } catch (err) {
      // The only acceptable refusal is the validator's own (a future guard on this
      // insert). Anything else (parameter shape, auth, ...) is a test failure.
      if (storedEntityId) throw err;
      expect((err as Error).message).toMatch(/capabilities\[0\]\.op/);
    }
    await expectNoAuthority(tp, storedEntityId);
  });

  async function seedInterpretationSource(): Promise<string> {
    const id = randomUUID();
    const { error } = await db.from("sources").insert({
      id,
      content_hash: `v1_inert_${id}`,
      mime_type: "application/json",
      storage_url: `internal://test/${id}`,
      file_size: 0,
      user_id: OWNER,
    });
    if (error) throw new Error(`seed source: ${error.message}`);
    createdSources.push(id);
    return id;
  }

  it("POST /interpretations/create: a v1-shaped agent_grant, persisted or refused, resolves to no authority", async () => {
    const tp = lowercaseThumbprint();
    const sourceId = await seedInterpretationSource();
    const { status, body } = await send("/interpretations/create", {
      source_id: sourceId,
      entities: [
        {
          entity_type: "agent_grant",
          label: "v1-interpretation-rest",
          status: "active",
          capabilities: [v1Capability()],
          match_thumbprint: tp,
          match_sub: AGENT_SUB,
          match_iss: AGENT_ISS,
        },
      ],
    });
    let storedEntityId: string | null = null;
    if (status === 200) {
      storedEntityId = (body.entities?.[0]?.entity_id as string | undefined) ?? null;
      expect(storedEntityId).toBeTruthy();
      created.push(storedEntityId as string);
    } else {
      // Only a validator refusal is acceptable here.
      expect(JSON.stringify(body)).toMatch(/capabilities\[0\]\.op/);
    }
    await expectNoAuthority(tp, storedEntityId);
  });

  it("MCP create_interpretation: a v1-shaped agent_grant, persisted or refused, resolves to no authority", async () => {
    const tp = lowercaseThumbprint();
    const sourceId = await seedInterpretationSource();
    let storedEntityId: string | null = null;
    try {
      const result = await callTool(server, "createInterpretation", {
        user_id: OWNER,
        source_id: sourceId,
        entities: [
          {
            entity_type: "agent_grant",
            label: "v1-interpretation-mcp",
            status: "active",
            capabilities: [v1Capability()],
            match_thumbprint: tp,
            match_sub: AGENT_SUB,
            match_iss: AGENT_ISS,
          },
        ],
      });
      const parsed = JSON.parse(result.content[0].text) as Record<string, any>;
      storedEntityId = (parsed.entities?.[0]?.entity_id as string | undefined) ?? null;
      expect(storedEntityId).toBeTruthy();
      created.push(storedEntityId as string);
    } catch (err) {
      if (storedEntityId) throw err;
      expect((err as Error).message).toMatch(/capabilities\[0\]\.op/);
    }
    await expectNoAuthority(tp, storedEntityId);
  });

  // ENABLE GATE. The change that makes the validator accept `agent_capability_v1`
  // must first reject or ignore every v1-shaped grant observation that already
  // exists, however it got there (any non-refusing surface above, a peer, a
  // restore). This test seeds one directly, bypassing every write guard, and
  // asserts it confers no authority. It passes today because the validator
  // refuses the v1 op on read; it WILL go red the moment the validator accepts
  // v1 unless that change also handles pre-existing observations. Whoever makes
  // it red must change it deliberately, with the gate satisfied, not delete it.
  it("ENABLE GATE: a v1-shaped grant observation seeded past every write guard confers no authority", async () => {
    const tp = thumbprint();
    const entityId = `ent_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const now = new Date().toISOString();
    const { error: entityError } = await db.from("entities").insert({
      id: entityId,
      entity_type: "agent_grant",
      canonical_name: `v1-gate-${tp.slice(0, 8)}`,
      user_id: OWNER,
      created_at: now,
      updated_at: now,
    });
    if (entityError) throw new Error(`seed entity: ${entityError.message}`);
    created.push(entityId);
    const { error } = await db.from("observations").insert({
      id: randomUUID(),
      entity_id: entityId,
      entity_type: "agent_grant",
      schema_version: "1.1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: now,
      specificity_score: 1,
      source_priority: 1000,
      fields: {
        label: "v1-gate",
        status: "active",
        capabilities: [v1Capability()],
        match_thumbprint: tp,
        match_sub: AGENT_SUB,
        match_iss: AGENT_ISS,
      },
      user_id: OWNER,
      created_at: now,
    });
    if (error) throw new Error(`seed observation: ${error.message}`);
    await recomputeSnapshot(entityId, OWNER);

    await expectNoAuthority(tp, entityId);
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
