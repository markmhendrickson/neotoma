/**
 * #2240 — every write records the signed-in person who made it, alongside the
 * shared graph it lands in.
 *
 * On a shared-graph instance (`NEOTOMA_SHARED_GRAPH_USER_ID`) every member
 * reads and writes one graph `user_id`. #2228 made the signed-in identity
 * survive sign-in onto the session and connection row, but nothing recorded it
 * on a write: every member's observation carried only the shared `user_id`, so
 * the stored record could not say who contributed it.
 *
 * The carrier is write provenance: the request-scoped attribution context
 * that already stamps the AAuth agent identity and the external actor into
 * every observation, relationship, timeline event, source and interpretation
 * now also carries the signed-in person, stamped as
 * `provenance.authenticated_user_id` — the signer's own per-email user_id,
 * deliberately not the email address.
 *
 * These tests drive the REAL Express app through the REAL Google sign-in flow
 * (only Google's JWKS and code-exchange endpoints are stubbed), then write on
 * each surface with its natural call shape and read the stored observation
 * rows back. They assert the stored value, never just the response:
 *
 *   - two members writing to one shared graph produce observations attributed
 *     to each, on REST `/store`, REST `/correct`, MCP stateless `store` and
 *     MCP session `store`; both land on the same graph `user_id`;
 *   - fail closed: a static-token write, a local no-auth write, and a write
 *     under a connection row that predates identity recording carry NO
 *     `authenticated_user_id` — never the graph owner's, never a member's.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { createLocalAuthUser } from "../../src/services/local_auth.js";
import {
  createGoogleSignInHarness,
  perEmailUserId,
  type GoogleSignInHarness,
} from "../helpers/google_sign_in.js";
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";

const CLIENT_ID = "write-attribution-test.apps.googleusercontent.com";
const MEMBER_A_EMAIL = "member-a@example.com";
const MEMBER_B_EMAIL = "member-b@example.com";
const OWNER_EMAIL = "attribution-graph-owner@example.com";
const SHARED_GRAPH_USER_ID = randomUUID().toLowerCase();
const STATIC_TOKEN = `static-${randomUUID()}`;

const ENV_KEYS = [
  "NEOTOMA_GOOGLE_CLIENT_ID",
  "NEOTOMA_GOOGLE_CLIENT_SECRET",
  "NEOTOMA_APPROVED_EMAILS",
  "NEOTOMA_SHARED_GRAPH_USER_ID",
  "NEOTOMA_BEARER_TOKEN",
] as const;

type ObservationRow = {
  id: string;
  entity_id: string;
  user_id: string;
  provenance: unknown;
};

let httpServer: ReturnType<typeof createServer>;
let apiBase = "";
let harness: GoogleSignInHarness;
const createdEntityIds = new Set<string>();

function provenanceOf(row: ObservationRow): Record<string, unknown> {
  const raw = row.provenance;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

async function observationsFor(entityId: string): Promise<ObservationRow[]> {
  const { data, error } = await db
    .from("observations")
    .select("id, entity_id, user_id, provenance")
    .eq("entity_id", entityId);
  expect(error).toBeFalsy();
  return (data ?? []) as ObservationRow[];
}

function firstEntityId(body: Record<string, unknown>): string {
  const direct = (body.entities as Array<{ entity_id?: string }> | undefined)?.[0]?.entity_id;
  const nested = ((body.structured as { entities?: Array<{ entity_id?: string }> } | undefined)
    ?.entities ?? [])[0]?.entity_id;
  const id = direct ?? nested;
  expect(id, `store response should name the entity: ${JSON.stringify(body)}`).toBeTruthy();
  createdEntityIds.add(id!);
  return id!;
}

function noteEntity(label: string): Record<string, unknown> {
  const marker = `${label} ${randomUUID().slice(0, 8)}`;
  return { entity_type: "note", title: marker, content: marker };
}

async function restStore(
  headers: Record<string, string>,
  label: string
): Promise<{ status: number; entityId?: string; text: string }> {
  const res = await fetch(`${apiBase}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      entities: [noteEntity(label)],
      idempotency_key: `write-attribution-${randomUUID()}`,
    }),
  });
  const text = await res.text();
  if (res.status !== 200) return { status: res.status, text };
  return { status: res.status, entityId: firstEntityId(JSON.parse(text)), text };
}

async function mcpStatelessStore(accessToken: string, label: string, id: number): Promise<string> {
  const reply = await modernPost(
    apiBase,
    {
      id,
      method: "tools/call",
      params: {
        name: "store",
        arguments: {
          entities: [noteEntity(label)],
          idempotency_key: `write-attribution-mcp-${randomUUID()}`,
        },
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  expect(reply.status, reply.text).toBe(200);
  expect(reply.body?.result?.isError, reply.text).not.toBe(true);
  return firstEntityId(toolResultJson(reply.body));
}

/** Parse a legacy Streamable HTTP reply, which may arrive as JSON or SSE. */
async function readRpc(res: Response): Promise<Record<string, any>> {
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    return JSON.parse(dataLines[dataLines.length - 1] ?? "{}");
  }
  return JSON.parse(text || "{}");
}

/** Pre-2026-07-28 client shape: initialize, then tools/call on the session. */
async function mcpSessionStore(accessToken: string, label: string): Promise<string> {
  const baseHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${accessToken}`,
  };
  const init = await fetch(`${apiBase}/mcp`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "write-attribution-probe", version: "0.0.0" },
      },
    }),
  });
  expect(init.status, await init.clone().text()).toBe(200);
  const sessionId = init.headers.get("mcp-session-id");
  expect(sessionId, "initialize should mint a session").toBeTruthy();
  await readRpc(init);

  const call = await fetch(`${apiBase}/mcp`, {
    method: "POST",
    headers: { ...baseHeaders, "mcp-session-id": sessionId! },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "store",
        arguments: {
          entities: [noteEntity(label)],
          idempotency_key: `write-attribution-session-${randomUUID()}`,
        },
      },
    }),
  });
  expect(call.status, await call.clone().text()).toBe(200);
  const reply = await readRpc(call);
  expect(reply.result?.isError, JSON.stringify(reply)).not.toBe(true);
  return firstEntityId(toolResultJson(reply as never));
}

/** Every observation on the entity names `principal` and lands on `graph`. */
async function expectAttributedTo(
  entityId: string,
  principal: string,
  graph: string
): Promise<void> {
  const rows = await observationsFor(entityId);
  expect(rows.length, "the write should have produced an observation").toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.user_id).toBe(graph);
    expect(provenanceOf(row).authenticated_user_id).toBe(principal);
  }
}

/** No observation on the entity names any person. */
async function expectUnattributed(entityId: string): Promise<void> {
  const rows = await observationsFor(entityId);
  expect(rows.length, "the write should have produced an observation").toBeGreaterThan(0);
  for (const row of rows) {
    expect(provenanceOf(row)).not.toHaveProperty("authenticated_user_id");
  }
}

async function seedGraphOwner(): Promise<void> {
  const ownerDb = await getDb();
  await ownerDb
    .prepare(
      "INSERT OR IGNORE INTO local_auth_users (id, email, password_hash, password_salt, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      SHARED_GRAPH_USER_ID,
      OWNER_EMAIL,
      "x",
      "x",
      new Date().toISOString(),
      new Date().toISOString(),
      null
    );
}

describe("#2240 shared-graph write attribution", () => {
  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected a TCP address");
    apiBase = `http://127.0.0.1:${address.port}`;
    harness = await createGoogleSignInHarness({ apiBase: () => apiBase, clientId: CLIENT_ID });
    await createLocalAuthUser(OWNER_EMAIL, randomUUID());
  });

  afterAll(async () => {
    harness.restoreFetch();
    for (const id of createdEntityIds) {
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(async () => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    process.env.NEOTOMA_GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.NEOTOMA_GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.NEOTOMA_APPROVED_EMAILS = [MEMBER_A_EMAIL, MEMBER_B_EMAIL].join(",");
    process.env.NEOTOMA_SHARED_GRAPH_USER_ID = SHARED_GRAPH_USER_ID;
    delete process.env.NEOTOMA_BEARER_TOKEN;
    await seedGraphOwner();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    harness.restoreFetch();
  });

  it("REST /store: two members' writes to one shared graph are attributed to each", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const b = await harness.signIn(MEMBER_B_EMAIL);
    const principalA = await perEmailUserId(MEMBER_A_EMAIL);
    const principalB = await perEmailUserId(MEMBER_B_EMAIL);
    expect(principalA).not.toBe(principalB);
    expect(principalA).not.toBe(SHARED_GRAPH_USER_ID);

    const writeA = await restStore({ Authorization: `Bearer ${a.accessToken}` }, "rest member a");
    const writeB = await restStore({ Authorization: `Bearer ${b.accessToken}` }, "rest member b");
    expect(writeA.status, writeA.text).toBe(200);
    expect(writeB.status, writeB.text).toBe(200);

    // Same graph, different authors — the distinction the stored record
    // could not make before #2240.
    await expectAttributedTo(writeA.entityId!, principalA, SHARED_GRAPH_USER_ID);
    await expectAttributedTo(writeB.entityId!, principalB, SHARED_GRAPH_USER_ID);

    // The subject id is recorded, never the address.
    for (const row of await observationsFor(writeA.entityId!)) {
      expect(JSON.stringify(provenanceOf(row))).not.toContain(MEMBER_A_EMAIL);
    }
  });

  it("REST /correct: a correction is attributed to the member who made it, not the entity's author", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const b = await harness.signIn(MEMBER_B_EMAIL);
    const principalA = await perEmailUserId(MEMBER_A_EMAIL);
    const principalB = await perEmailUserId(MEMBER_B_EMAIL);

    const writeA = await restStore({ Authorization: `Bearer ${a.accessToken}` }, "correct target");
    expect(writeA.status, writeA.text).toBe(200);

    const correctRes = await fetch(`${apiBase}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${b.accessToken}` },
      body: JSON.stringify({
        entity_id: writeA.entityId,
        entity_type: "note",
        field: "content",
        value: `corrected by b ${randomUUID().slice(0, 8)}`,
        idempotency_key: `write-attribution-correct-${randomUUID()}`,
      }),
    });
    expect(correctRes.status, await correctRes.clone().text()).toBe(200);

    const rows = await observationsFor(writeA.entityId!);
    const principals = rows.map((row) => provenanceOf(row).authenticated_user_id);
    expect(principals).toContain(principalA);
    expect(principals).toContain(principalB);
    for (const row of rows) expect(row.user_id).toBe(SHARED_GRAPH_USER_ID);
  });

  it("MCP stateless store: two members' writes are attributed to each", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const b = await harness.signIn(MEMBER_B_EMAIL);
    const principalA = await perEmailUserId(MEMBER_A_EMAIL);
    const principalB = await perEmailUserId(MEMBER_B_EMAIL);

    const entityA = await mcpStatelessStore(a.accessToken, "mcp stateless member a", 101);
    const entityB = await mcpStatelessStore(b.accessToken, "mcp stateless member b", 102);

    await expectAttributedTo(entityA, principalA, SHARED_GRAPH_USER_ID);
    await expectAttributedTo(entityB, principalB, SHARED_GRAPH_USER_ID);
  });

  it("MCP session store: two members' writes are attributed to each", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const b = await harness.signIn(MEMBER_B_EMAIL);
    const principalA = await perEmailUserId(MEMBER_A_EMAIL);
    const principalB = await perEmailUserId(MEMBER_B_EMAIL);

    const entityA = await mcpSessionStore(a.accessToken, "mcp session member a");
    const entityB = await mcpSessionStore(b.accessToken, "mcp session member b");

    await expectAttributedTo(entityA, principalA, SHARED_GRAPH_USER_ID);
    await expectAttributedTo(entityB, principalB, SHARED_GRAPH_USER_ID);
  });

  describe("fails closed: no verified sign-in means no person", () => {
    it("a static-token write on REST names no person", async () => {
      // Sign a member in first, so a principal leaking across requests would
      // have something to leak.
      await harness.signIn(MEMBER_A_EMAIL);
      process.env.NEOTOMA_BEARER_TOKEN = STATIC_TOKEN;
      const write = await restStore({ Authorization: `Bearer ${STATIC_TOKEN}` }, "rest static");
      expect(write.status, write.text).toBe(200);
      await expectUnattributed(write.entityId!);
    });

    it("a static-token write on MCP names no person", async () => {
      await harness.signIn(MEMBER_A_EMAIL);
      process.env.NEOTOMA_BEARER_TOKEN = STATIC_TOKEN;
      const entityId = await mcpStatelessStore(STATIC_TOKEN, "mcp static", 201);
      await expectUnattributed(entityId);
    });

    it("a local no-auth write names no person", async () => {
      const write = await restStore({}, "rest local no auth");
      expect(write.status, write.text).toBe(200);
      await expectUnattributed(write.entityId!);
    });

    it("a write under a connection row with no recorded sign-in names no person, not the owner", async () => {
      const residualToken = `local_access_${randomUUID().replace(/-/g, "")}`;
      const residualConnection = `conn_residual_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const rowDb = await getDb();
      await rowDb
        .prepare(
          "INSERT INTO mcp_oauth_connections (id, user_id, connection_id, refresh_token, access_token, access_token_expires_at, client_name, last_used_at, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          randomUUID(),
          SHARED_GRAPH_USER_ID,
          residualConnection,
          `local_refresh_${randomUUID().replace(/-/g, "")}`,
          residualToken,
          new Date(Date.now() + 3600_000).toISOString(),
          null,
          null,
          new Date().toISOString(),
          null
        );

      const rest = await restStore({ Authorization: `Bearer ${residualToken}` }, "rest residual");
      expect(rest.status, rest.text).toBe(200);
      await expectUnattributed(rest.entityId!);

      const mcpEntity = await mcpStatelessStore(residualToken, "mcp residual", 301);
      await expectUnattributed(mcpEntity);

      // The write still lands on the shared graph — attribution is withheld,
      // access is not changed.
      for (const row of await observationsFor(rest.entityId!)) {
        expect(row.user_id).toBe(SHARED_GRAPH_USER_ID);
      }
    });
  });
});
