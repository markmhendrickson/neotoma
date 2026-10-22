/**
 * #2240 — writes record the signed-in member who made them, alongside the
 * shared graph they land in.
 *
 * On a shared-graph instance (`NEOTOMA_SHARED_GRAPH_USER_ID`) every member
 * reads and writes one graph `user_id`. #2228 made the signed-in identity
 * survive sign-in onto the session and connection row, but nothing recorded it
 * on a write, so the stored record could not say who contributed it.
 *
 * The carrier is write provenance: the request-scoped attribution context
 * that already stamps the AAuth agent identity and the external actor now also
 * carries the signed-in member, stamped as `provenance.authenticated_actor_id`.
 * The value is the member's per-instance write-attribution id — a random UUID
 * held in `member_attribution_ids` — NOT the member's local-auth user id, which
 * is an unkeyed hash of their email and would let anyone holding the team's
 * addresses re-identify authors, and would link a person across instances.
 *
 * These tests drive the REAL Express app through the REAL Google sign-in flow
 * (only Google's JWKS and code-exchange endpoints are stubbed), then write on
 * each surface with its natural call shape and read the stored rows back:
 *
 *   - two members writing to one shared graph produce observations attributed
 *     to each, on REST `/store`, REST `/correct`, MCP stateless `store` and
 *     `correct`, and MCP session `store`; all land on the shared graph;
 *   - the recorded id is not derivable from the email: it is not the email
 *     hash, and re-minting after the mapping row is deleted yields a new id;
 *   - guests never see it: a guest-token read of an attributed entity returns
 *     no `authenticated_actor_id`, while a member's read of the same entity does;
 *   - fail closed: a static-token write, a local no-auth write, and a write
 *     under a connection row that predates identity recording carry NO
 *     `authenticated_actor_id` — never the graph owner's, never a member's.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { createLocalAuthUser } from "../../src/services/local_auth.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
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
  "NEOTOMA_ACCESS_POLICY_NOTE",
] as const;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTOR_KEY = "authenticated_actor_id";

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

async function mcpStatelessCorrect(
  accessToken: string,
  entityId: string,
  value: string,
  id: number
): Promise<void> {
  const reply = await modernPost(
    apiBase,
    {
      id,
      method: "tools/call",
      params: {
        name: "correct",
        arguments: {
          entity_id: entityId,
          entity_type: "note",
          field: "content",
          value,
          idempotency_key: `write-attribution-mcp-correct-${randomUUID()}`,
        },
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  expect(reply.status, reply.text).toBe(200);
  expect(reply.body?.result?.isError, reply.text).not.toBe(true);
}

/** The attribution id this instance minted for a member, read from storage. */
async function memberActorId(email: string): Promise<string> {
  const rowDb = await getDb();
  const row = (await rowDb
    .prepare("SELECT attribution_id FROM member_attribution_ids WHERE local_user_id = ?")
    .get(await perEmailUserId(email))) as { attribution_id?: string } | undefined;
  expect(row?.attribution_id, `no attribution id minted for ${email}`).toBeTruthy();
  return row!.attribution_id!;
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

/** Every observation on the entity names `actorId` and lands on `graph`. */
async function expectAttributedTo(entityId: string, actorId: string, graph: string): Promise<void> {
  const rows = await observationsFor(entityId);
  expect(rows.length, "the write should have produced an observation").toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.user_id).toBe(graph);
    expect(provenanceOf(row)[ACTOR_KEY]).toBe(actorId);
  }
}

/** No observation on the entity names any person. */
async function expectUnattributed(entityId: string): Promise<void> {
  const rows = await observationsFor(entityId);
  expect(rows.length, "the write should have produced an observation").toBeGreaterThan(0);
  for (const row of rows) {
    expect(provenanceOf(row)).not.toHaveProperty(ACTOR_KEY);
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
    delete process.env.NEOTOMA_ACCESS_POLICY_NOTE;
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

    const writeA = await restStore({ Authorization: `Bearer ${a.accessToken}` }, "rest member a");
    const writeB = await restStore({ Authorization: `Bearer ${b.accessToken}` }, "rest member b");
    expect(writeA.status, writeA.text).toBe(200);
    expect(writeB.status, writeB.text).toBe(200);

    const actorA = await memberActorId(MEMBER_A_EMAIL);
    const actorB = await memberActorId(MEMBER_B_EMAIL);
    expect(actorA).not.toBe(actorB);

    // Same graph, different authors — the distinction the stored record
    // could not make before #2240.
    await expectAttributedTo(writeA.entityId!, actorA, SHARED_GRAPH_USER_ID);
    await expectAttributedTo(writeB.entityId!, actorB, SHARED_GRAPH_USER_ID);

    // A second write by the same member carries the same id.
    const writeA2 = await restStore({ Authorization: `Bearer ${a.accessToken}` }, "rest member a2");
    await expectAttributedTo(writeA2.entityId!, actorA, SHARED_GRAPH_USER_ID);
  });

  it("records a random per-instance id, not anything derivable from the member's email", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    // The test database outlives a run; start from no mapping so the first
    // write below mints under the code being tested.
    const localId = await perEmailUserId(MEMBER_A_EMAIL);
    const rowDb = await getDb();
    await rowDb.prepare("DELETE FROM member_attribution_ids WHERE local_user_id = ?").run(localId);

    const write = await restStore({ Authorization: `Bearer ${a.accessToken}` }, "not derivable");
    expect(write.status, write.text).toBe(200);

    const [row] = await observationsFor(write.entityId!);
    const recorded = provenanceOf(row!)[ACTOR_KEY] as string;
    expect(recorded).toMatch(UUID_SHAPE);
    // Not the local-auth id, which is an unkeyed hash of the email.
    expect(recorded).not.toBe(localId);
    // Nothing in provenance carries the email or the email-derived id.
    const blob = JSON.stringify(provenanceOf(row!));
    expect(blob).not.toContain(MEMBER_A_EMAIL);
    expect(blob).not.toContain(localId);

    // Minted, not computed: drop the mapping and the next resolution mints a
    // DIFFERENT id for the same member and the same email. A value derived
    // from the email (hashed, keyed or not) would come back identical.
    await rowDb.prepare("DELETE FROM member_attribution_ids WHERE local_user_id = ?").run(localId);
    const again = await restStore({ Authorization: `Bearer ${a.accessToken}` }, "re-minted");
    expect(again.status, again.text).toBe(200);
    const [againRow] = await observationsFor(again.entityId!);
    const reminted = provenanceOf(againRow!)[ACTOR_KEY] as string;
    expect(reminted).toMatch(UUID_SHAPE);
    expect(reminted).not.toBe(recorded);
    expect(reminted).toBe(await memberActorId(MEMBER_A_EMAIL));
  });

  it("REST /correct: a correction is attributed to the member who made it, not the entity's author", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const b = await harness.signIn(MEMBER_B_EMAIL);

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
    const actors = rows.map((row) => provenanceOf(row)[ACTOR_KEY]);
    expect(actors).toContain(await memberActorId(MEMBER_A_EMAIL));
    expect(actors).toContain(await memberActorId(MEMBER_B_EMAIL));
    for (const row of rows) expect(row.user_id).toBe(SHARED_GRAPH_USER_ID);
  });

  it("MCP stateless store and correct: each member's write is attributed to them", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const b = await harness.signIn(MEMBER_B_EMAIL);

    const entityA = await mcpStatelessStore(a.accessToken, "mcp stateless member a", 101);
    const entityB = await mcpStatelessStore(b.accessToken, "mcp stateless member b", 102);
    const actorA = await memberActorId(MEMBER_A_EMAIL);
    const actorB = await memberActorId(MEMBER_B_EMAIL);

    await expectAttributedTo(entityA, actorA, SHARED_GRAPH_USER_ID);
    await expectAttributedTo(entityB, actorB, SHARED_GRAPH_USER_ID);

    // B corrects A's entity over MCP: the correction names B.
    await mcpStatelessCorrect(b.accessToken, entityA, `mcp corrected by b ${randomUUID()}`, 103);
    const actors = (await observationsFor(entityA)).map((row) => provenanceOf(row)[ACTOR_KEY]);
    expect(actors).toContain(actorA);
    expect(actors).toContain(actorB);
  });

  it("MCP session store: two members' writes are attributed to each", async () => {
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const b = await harness.signIn(MEMBER_B_EMAIL);

    const entityA = await mcpSessionStore(a.accessToken, "mcp session member a");
    const entityB = await mcpSessionStore(b.accessToken, "mcp session member b");

    await expectAttributedTo(entityA, await memberActorId(MEMBER_A_EMAIL), SHARED_GRAPH_USER_ID);
    await expectAttributedTo(entityB, await memberActorId(MEMBER_B_EMAIL), SHARED_GRAPH_USER_ID);
  });

  it("a guest-token read of an attributed entity never returns the member id", async () => {
    process.env.NEOTOMA_ACCESS_POLICY_NOTE = "read_only";
    const a = await harness.signIn(MEMBER_A_EMAIL);
    const write = await restStore({ Authorization: `Bearer ${a.accessToken}` }, "guest shared");
    expect(write.status, write.text).toBe(200);
    const actorA = await memberActorId(MEMBER_A_EMAIL);

    const guestToken = await generateGuestAccessToken({
      entityIds: [write.entityId!],
      userId: SHARED_GRAPH_USER_ID,
    });
    try {
      // Control: a member's read of the same observations DOES carry it, so a
      // clean guest response below is redaction, not an empty instrument.
      const memberRead = await fetch(`${apiBase}/entities/${write.entityId}/observations`, {
        headers: { Authorization: `Bearer ${a.accessToken}` },
      });
      expect(memberRead.status).toBe(200);
      expect(await memberRead.text()).toContain(actorA);

      for (const path of [
        `/entities/${write.entityId}/observations`,
        `/entities/${write.entityId}`,
      ]) {
        const guestRead = await fetch(
          `${apiBase}${path}?access_token=${encodeURIComponent(guestToken)}`
        );
        const text = await guestRead.text();
        expect(guestRead.status, `${path}: ${text}`).toBe(200);
        expect(text, path).not.toContain(ACTOR_KEY);
        expect(text, path).not.toContain(actorA);
      }
      // The guest still gets the observations themselves.
      const guestObs = await fetch(
        `${apiBase}/entities/${write.entityId}/observations?access_token=${encodeURIComponent(guestToken)}`
      );
      const body = (await guestObs.json()) as { observations?: unknown[] };
      expect(body.observations?.length ?? 0).toBeGreaterThan(0);
    } finally {
      const tokenEntityId = `guest_token_${hashGuestAccessToken(guestToken).slice(0, 16)}`;
      await db.from("observations").delete().eq("entity_id", tokenEntityId);
      await db.from("entities").delete().eq("id", tokenEntityId);
    }
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
