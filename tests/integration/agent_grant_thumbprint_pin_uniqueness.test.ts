/**
 * A key thumbprint can be pinned by grants under one owner only.
 *
 * Every write entrance that can set `match_thumbprint` on an
 * `agent_grant` (or return a grant carrying one to active) refuses a pin
 * that a grant under another owner already holds:
 *
 *   - the grants service (`createGrant`, `updateGrantFields`)
 *   - REST `/agents/grants` (create, update)
 *   - REST `/store` and `/correct`
 *   - MCP `store` and `correct`
 *   - `neotoma agents grants import`
 *
 * Runs against the real SQLite store (NEOTOMA_DATA_DIR). Restoring a
 * grant whose key another owner pins is covered in
 * `tests/unit/agent_grant_pin_checks.test.ts`, since the write checks
 * here prevent that state from being created.
 */

import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import {
  AgentGrantPinConflictError,
  clearGrantCacheForTests,
  createGrant,
  getGrant,
  listGrantsForUser,
  setStatus,
  updateGrantFields,
} from "../../src/services/agent_grants.js";
import { runAgentsGrantsImport } from "../../src/cli/agents_grants_import.js";
import { cleanupTestEntities } from "../helpers/cleanup_helpers.js";

// The HTTP local path resolves the nil-UUID; the MCP server is pinned to the
// same user so both transports act as the same (second) owner.
const OWNER_B = LOCAL_DEV_USER_ID;
const OWNER_A = randomUUID();
let apiBase = "";
const CAPS = [{ op: "retrieve", entity_types: ["task"] }];

function thumbprint(): string {
  return randomBytes(32).toString("base64url");
}

function callTool(server: NeotomaServer, name: "store" | "correct", params: Record<string, unknown>) {
  return (
    server as unknown as Record<
      string,
      (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>
    >
  )[name](params);
}

async function postJson(path: string, body: unknown, method = "POST") {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe("agent_grant thumbprint pins are unique across owners", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;
  const created: string[] = [];

  async function grantFor(owner: string, tp: string, matchSub?: string) {
    const grant = await createGrant(owner, {
      label: `pin-test ${randomUUID().slice(0, 8)}`,
      capabilities: CAPS as any,
      match_thumbprint: tp,
      ...(matchSub ? { match_sub: matchSub } : {}),
    });
    created.push(grant.grant_id);
    return grant;
  }

  async function pinnedBy(owner: string, tp: string) {
    const grants = await listGrantsForUser(owner, { status: "all" });
    return grants.filter((g) => g.match_thumbprint === tp);
  }

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = OWNER_B;
    httpServer = createServer(app);
    // Ephemeral port: avoids colliding with suites that pin a fixed one.
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
    delete process.env.NEOTOMA_AGENT_CAPABILITIES_JSON;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupTestEntities(created);
  });

  it("grants service: createGrant refuses a thumbprint another owner has pinned", async () => {
    const tp = thumbprint();
    const theirs = await grantFor(OWNER_A, tp);

    await expect(grantFor(OWNER_B, tp)).rejects.toBeInstanceOf(AgentGrantPinConflictError);
    expect(await pinnedBy(OWNER_B, tp)).toHaveLength(0);
    expect((await getGrant(OWNER_A, theirs.grant_id))?.label).toBe(theirs.label);
  });

  it("grants service: the same owner may pin a thumbprint it already holds", async () => {
    const tp = thumbprint();
    await grantFor(OWNER_A, tp);
    const again = await grantFor(OWNER_A, tp, "same-owner@agents.example");
    expect(again.match_thumbprint).toBe(tp);
  });

  it("grants service: updateGrantFields refuses to pin another owner's thumbprint", async () => {
    const tp = thumbprint();
    await grantFor(OWNER_A, tp);
    const mine = await grantFor(OWNER_B, thumbprint());

    await expect(
      updateGrantFields(OWNER_B, mine.grant_id, { match_thumbprint: tp, label: "renamed" })
    ).rejects.toBeInstanceOf(AgentGrantPinConflictError);

    const after = await getGrant(OWNER_B, mine.grant_id);
    expect(after?.match_thumbprint).toBe(mine.match_thumbprint);
    expect(after?.label).toBe(mine.label);
  });

  it("grants service: a revoked grant still holds its pin", async () => {
    const tp = thumbprint();
    const theirs = await grantFor(OWNER_A, tp);
    await setStatus(OWNER_A, theirs.grant_id, "revoked");

    await expect(grantFor(OWNER_B, tp)).rejects.toBeInstanceOf(AgentGrantPinConflictError);
    const unchanged = await getGrant(OWNER_A, theirs.grant_id);
    expect(unchanged?.status).toBe("revoked");
    expect(unchanged?.label).toBe(theirs.label);
  });

  it("grants service: a suspended grant still holds its pin", async () => {
    const tp = thumbprint();
    const theirs = await grantFor(OWNER_A, tp);
    await setStatus(OWNER_A, theirs.grant_id, "suspended");

    await expect(grantFor(OWNER_B, tp)).rejects.toBeInstanceOf(AgentGrantPinConflictError);
  });

  it("REST /agents/grants: create returns 409 for another owner's pin", async () => {
    const tp = thumbprint();
    await grantFor(OWNER_A, tp);

    const { status, body } = await postJson("/agents/grants", {
      label: "rest-create",
      capabilities: CAPS,
      match_thumbprint: tp,
    });

    expect(status).toBe(409);
    expect(JSON.stringify(body)).toContain("agent_grant_pin_conflict");
    expect(await pinnedBy(OWNER_B, tp)).toHaveLength(0);
  });

  it("REST /agents/grants/:id: update returns 409 for another owner's pin", async () => {
    const tp = thumbprint();
    await grantFor(OWNER_A, tp);
    const mine = await grantFor(OWNER_B, thumbprint());

    const { status } = await postJson(
      `/agents/grants/${mine.grant_id}`,
      { match_thumbprint: tp },
      "PATCH"
    );

    expect(status).toBe(409);
    expect((await getGrant(OWNER_B, mine.grant_id))?.match_thumbprint).toBe(mine.match_thumbprint);
  });

  it("REST /store: refuses an active agent_grant for a key another owner's revoked grant pins", async () => {
    const tp = thumbprint();
    const theirs = await grantFor(OWNER_A, tp);
    await setStatus(OWNER_A, theirs.grant_id, "revoked");

    const { status } = await postJson("/store", {
      idempotency_key: `pin-rest-store-revoked-${randomUUID()}`,
      entities: [
        {
          entity_type: "agent_grant",
          label: "rest-store-revoked",
          status: "active",
          capabilities: CAPS,
          match_thumbprint: tp,
        },
      ],
    });

    expect(status).toBe(409);
    const unchanged = await getGrant(OWNER_A, theirs.grant_id);
    expect(unchanged?.status).toBe("revoked");
    expect(unchanged?.label).toBe(theirs.label);
  });

  it("REST /store: refuses an agent_grant carrying another owner's pin", async () => {
    const tp = thumbprint();
    const theirs = await grantFor(OWNER_A, tp);

    const { status, body } = await postJson("/store", {
      idempotency_key: `pin-rest-store-${randomUUID()}`,
      entities: [
        {
          entity_type: "agent_grant",
          label: "rest-store",
          status: "active",
          capabilities: [{ op: "store", entity_types: ["task"] }],
          match_thumbprint: tp,
        },
      ],
    });

    expect(status).toBe(409);
    expect(JSON.stringify(body)).toContain("agent_grant_pin_conflict");
    expect(await pinnedBy(OWNER_B, tp)).toHaveLength(0);
    const unchanged = await getGrant(OWNER_A, theirs.grant_id);
    expect(unchanged?.label).toBe(theirs.label);
    expect(unchanged?.capabilities).toEqual(theirs.capabilities);
  });

  it("REST /correct: refuses setting match_thumbprint to another owner's pin", async () => {
    const tp = thumbprint();
    await grantFor(OWNER_A, tp);
    const mine = await grantFor(OWNER_B, thumbprint());

    const { status } = await postJson("/correct", {
      entity_id: mine.grant_id,
      entity_type: "agent_grant",
      field: "match_thumbprint",
      value: tp,
      idempotency_key: `pin-rest-correct-${randomUUID()}`,
    });

    expect(status).toBe(409);
    expect((await getGrant(OWNER_B, mine.grant_id))?.match_thumbprint).toBe(mine.match_thumbprint);
  });


  it("MCP store: refuses an agent_grant carrying another owner's pin", async () => {
    const tp = thumbprint();
    const theirs = await grantFor(OWNER_A, tp);

    await expect(
      callTool(server, "store", {
        user_id: OWNER_B,
        idempotency_key: `pin-mcp-store-${randomUUID()}`,
        commit: true,
        entities: [
          {
            entity_type: "agent_grant",
            label: "mcp-store",
            status: "active",
            capabilities: [{ op: "store", entity_types: ["task"] }],
            match_thumbprint: tp,
          },
        ],
      })
    ).rejects.toThrow(/agent_grant_pin_conflict|already pinned/);
    expect(await pinnedBy(OWNER_B, tp)).toHaveLength(0);
    const unchanged = await getGrant(OWNER_A, theirs.grant_id);
    expect(unchanged?.label).toBe(theirs.label);
    expect(unchanged?.capabilities).toEqual(theirs.capabilities);
  });

  it("MCP correct: refuses setting match_thumbprint to another owner's pin", async () => {
    const tp = thumbprint();
    await grantFor(OWNER_A, tp);
    const mine = await grantFor(OWNER_B, thumbprint());

    await expect(
      callTool(server, "correct", {
        user_id: OWNER_B,
        entity_id: mine.grant_id,
        entity_type: "agent_grant",
        field: "match_thumbprint",
        value: tp,
        idempotency_key: `pin-mcp-correct-${randomUUID()}`,
      })
    ).rejects.toThrow(/agent_grant_pin_conflict|already pinned/);
    expect((await getGrant(OWNER_B, mine.grant_id))?.match_thumbprint).toBe(mine.match_thumbprint);
  });

  it("grants import: skips an entry whose thumbprint another owner has pinned", async () => {
    const tp = thumbprint();
    await grantFor(OWNER_A, tp);
    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
      agents: {
        imported_pin_test: {
          match: { thumbprint: tp },
          capabilities: CAPS,
        },
      },
    });

    const result = await runAgentsGrantsImport({ ownerUserId: OWNER_B });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    const outcome = result.outcomes[0] as { kind: string; reason?: string };
    expect(outcome.kind).toBe("skipped");
    expect(outcome.reason).toMatch(/already pinned/);
    expect(await pinnedBy(OWNER_B, tp)).toHaveLength(0);
  });
});
