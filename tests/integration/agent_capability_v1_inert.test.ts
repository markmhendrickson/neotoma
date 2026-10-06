/**
 * The reserved `agent_capability_v1` shape is declared in the contract but not
 * accepted by any write surface.
 *
 * Runs the real HTTP app against the SQLite store. Every entrance that can
 * write an `agent_grant` (the grants routes and `/store`) must still refuse a
 * grant carrying a v1 entry, and a legacy-shaped grant must keep behaving
 * exactly as before, including ignoring the reserved validity fields.
 */

import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import {
  clearGrantCacheForTests,
  getGrant,
  listGrantsForUser,
} from "../../src/services/agent_grants.js";
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

describe("agent_capability_v1 is declared but not accepted", () => {
  let httpServer: ReturnType<typeof createServer>;
  const created: string[] = [];

  beforeAll(async () => {
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

    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("agent_grant_invalid");
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    expect(await pinnedBy(tp)).toHaveLength(0);
  });

  it("PATCH /agents/grants/:id refuses a v1 capability and leaves the grant unchanged", async () => {
    const tp = thumbprint();
    const made = await send("/agents/grants", {
      label: "legacy-for-patch",
      capabilities: LEGACY_CAPS,
      match_thumbprint: tp,
    });
    expect(made.status).toBe(201);
    const grantId = made.body.grant.grant_id as string;
    created.push(grantId);

    const { status, body } = await send(
      `/agents/grants/${grantId}`,
      { capabilities: [v1Capability()] },
      "PATCH"
    );

    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("agent_grant_invalid");
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    const after = await getGrant(OWNER, grantId);
    expect(after?.capabilities).toEqual(LEGACY_CAPS);
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

    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).toContain("capabilities[0].op");
    expect(await pinnedBy(tp)).toHaveLength(0);
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
    // Nothing reads or stores the reserved fields yet.
    expect(body.grant).not.toHaveProperty("valid_from");
    expect(body.grant).not.toHaveProperty("valid_until");
    const stored = await getGrant(OWNER, body.grant.grant_id as string);
    expect(stored).not.toHaveProperty("valid_from");
    expect(stored).not.toHaveProperty("valid_until");
  });
});
