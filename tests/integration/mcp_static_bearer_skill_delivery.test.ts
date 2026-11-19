/**
 * A static bearer token (NEOTOMA_BEARER_TOKEN) on a shared-graph instance
 * (NEOTOMA_SHARED_GRAPH_USER_ID) acts as the shared graph owner on REST and
 * MCP alike, so the team's skills stored under that owner are visible to it.
 *
 * Before: the static token was the built-in nil user on both surfaces. REST
 * reads of the owner's rows needed `?user_id=` plus an override flag, MCP
 * reported "not found", and `initialize` listed the nil user's (empty) skills.
 *
 * Without shared-graph mode the token keeps acting as the nil user exactly as
 * before (regression block at the end).
 *
 * The app runs in process on 127.0.0.1 with a temporary data directory and a
 * synthetic token. Static-token calls carry a public X-Forwarded-For hop so the
 * local no-auth path cannot admit them: only the token decides. Seeding is done
 * by the local no-token caller with an explicit `user_id`, which never touches
 * the static-bearer code under test.
 */

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const NIL_USER_ID = "00000000-0000-0000-0000-000000000000";
const STATIC_TOKEN = `static-skill-delivery-${randomUUID()}`;
const REMOTE = { "X-Forwarded-For": "198.51.100.23" };

let env: McpTestEnv | undefined;
let booted: BootedMcpApp | undefined;
let originalSharedGraph: string | undefined;

async function boot(sharedGraphUserId: string | null): Promise<string> {
  originalSharedGraph = process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
  env = prepareMcpTestEnv("neotoma-static-bearer-skill-");
  process.env.NEOTOMA_BEARER_TOKEN = STATIC_TOKEN;
  if (sharedGraphUserId) process.env.NEOTOMA_SHARED_GRAPH_USER_ID = sharedGraphUserId;
  else delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
  booted = await bootMcpApp();
  return booted.baseUrl;
}

/** Store a skill under `ownerUserId` as the local no-token caller. */
async function seedSkill(baseUrl: string, ownerUserId: string, name: string): Promise<string> {
  const res = await fetch(`${baseUrl}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: ownerUserId,
      entities: [
        {
          entity_type: "skill",
          name,
          description: "Synthetic skill for static bearer delivery tests",
          enabled: true,
        },
      ],
      idempotency_key: `static-bearer-skill-seed-${randomUUID()}`,
    }),
  });
  const text = await res.text();
  expect(res.status, text).toBe(200);
  const body = JSON.parse(text) as {
    entities?: Array<{ entity_id?: string }>;
    structured?: { entities?: Array<{ entity_id?: string }> };
  };
  const id = body.entities?.[0]?.entity_id ?? body.structured?.entities?.[0]?.entity_id;
  expect(id, text).toBeTruthy();
  return id!;
}

async function mcpTool(
  baseUrl: string,
  name: string,
  args: Record<string, unknown>,
  id = 1
): Promise<Record<string, unknown>> {
  const reply = await modernPost(
    baseUrl,
    { id, method: "tools/call", params: { name, arguments: args } },
    { headers: { Authorization: `Bearer ${STATIC_TOKEN}`, ...REMOTE } }
  );
  expect(reply.status, reply.text).toBe(200);
  expect(reply.body?.error, reply.text).toBeUndefined();
  return toolResultJson(reply.body);
}

/** Legacy `initialize` with the static token; returns the result object. */
async function mcpInitialize(baseUrl: string): Promise<{
  instructions?: string;
  serverInfo?: { _neotoma?: { available_skills?: string[] } };
}> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STATIC_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...REMOTE,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "static-bearer-skill-probe", version: "0.0.0" },
      },
    }),
  });
  const text = await res.text();
  expect(res.status, text).toBe(200);
  // The transport may answer as JSON or as one SSE event.
  const json = text.trim().startsWith("{")
    ? text
    : (text
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim() ?? "");
  return (JSON.parse(json) as { result: Record<string, unknown> }).result as never;
}

async function restGetEntity(baseUrl: string, entityId: string): Promise<Response> {
  return fetch(`${baseUrl}/entities/${encodeURIComponent(entityId)}`, {
    headers: { Authorization: `Bearer ${STATIC_TOKEN}`, ...REMOTE },
  });
}

function entityIdsOf(result: Record<string, unknown>): string[] {
  const entities = (result.entities ?? []) as Array<{ entity_id?: string; id?: string }>;
  return entities.map((e) => e.entity_id ?? e.id ?? "");
}

afterEach(async () => {
  if (booted) await booted.close();
  booted = undefined;
  env?.restore();
  env = undefined;
  if (originalSharedGraph === undefined) delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
  else process.env.NEOTOMA_SHARED_GRAPH_USER_ID = originalSharedGraph;
});

describe("static bearer on a shared-graph instance acts as the shared owner", () => {
  const sharedOwner = randomUUID().toLowerCase();
  const skillName = `team-skill-${randomUUID().slice(0, 8)}`;
  let baseUrl = "";
  let skillEntityId = "";

  beforeEach(async () => {
    baseUrl = await boot(sharedOwner);
    skillEntityId = await seedSkill(baseUrl, sharedOwner, skillName);
  });

  it("MCP get_authenticated_user returns the shared owner", async () => {
    const result = await mcpTool(baseUrl, "get_authenticated_user", {});
    expect(result.user_id).toBe(sharedOwner);
  });

  it("MCP retrieve_entity_by_identifier and retrieve_entities find the owner's skill", async () => {
    const byId = await mcpTool(baseUrl, "retrieve_entity_by_identifier", {
      identifier: skillName,
      entity_type: "skill",
    });
    expect(entityIdsOf(byId)).toContain(skillEntityId);

    const list = await mcpTool(baseUrl, "retrieve_entities", { entity_type: "skill" }, 2);
    expect(entityIdsOf(list)).toContain(skillEntityId);
  });

  it("initialize lists the shared owner's skills", async () => {
    const result = await mcpInitialize(baseUrl);
    expect(result.serverInfo?._neotoma?.available_skills ?? []).toContain(skillName);
    expect(result.instructions ?? "").toContain(skillName);
  });

  it("REST GET of the skill succeeds without a user_id parameter", async () => {
    const res = await restGetEntity(baseUrl, skillEntityId);
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it("a static-token write lands under the shared owner (behaviour change)", async () => {
    const stored = await mcpTool(baseUrl, "store", {
      entities: [{ entity_type: "note", title: "static write", content: "static write" }],
      idempotency_key: `static-bearer-write-${randomUUID()}`,
    });
    const writtenId = entityIdsOf({
      entities:
        (stored.entities as unknown[]) ??
        ((stored.structured as { entities?: unknown[] } | undefined)?.entities ?? []),
    })[0];
    expect(writtenId, JSON.stringify(stored)).toBeTruthy();

    const { db } = await import("../../src/db.js");
    const { data } = await db.from("entities").select("id, user_id").eq("id", writtenId);
    const rows = (data ?? []) as Array<{ user_id: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(sharedOwner);
  });

  it("a client-sent shared-graph connection id is not honoured without the token", async () => {
    const reply = await modernPost(
      baseUrl,
      { id: 1, method: "tools/call", params: { name: "get_authenticated_user", arguments: {} } },
      { connectionId: "static-bearer-shared-graph", headers: REMOTE }
    );
    expect(reply.status).toBe(401);
  });
});

describe("without shared-graph mode the static bearer is unchanged (nil user)", () => {
  const otherOwner = randomUUID().toLowerCase();
  const skillName = `other-skill-${randomUUID().slice(0, 8)}`;
  let baseUrl = "";
  let skillEntityId = "";

  beforeEach(async () => {
    baseUrl = await boot(null);
    skillEntityId = await seedSkill(baseUrl, otherOwner, skillName);
  });

  it("MCP get_authenticated_user returns the nil user", async () => {
    const result = await mcpTool(baseUrl, "get_authenticated_user", {});
    expect(result.user_id).toBe(NIL_USER_ID);
  });

  it("MCP retrieval does not see another user's skill", async () => {
    const byId = await mcpTool(baseUrl, "retrieve_entity_by_identifier", {
      identifier: skillName,
      entity_type: "skill",
    });
    expect(entityIdsOf(byId)).not.toContain(skillEntityId);
    const list = await mcpTool(baseUrl, "retrieve_entities", { entity_type: "skill" }, 2);
    expect(entityIdsOf(list)).not.toContain(skillEntityId);
  });

  it("initialize does not list another user's skill", async () => {
    const result = await mcpInitialize(baseUrl);
    expect(result.serverInfo?._neotoma?.available_skills ?? []).not.toContain(skillName);
  });

  it("REST GET of another user's skill is refused without a user_id parameter", async () => {
    const res = await restGetEntity(baseUrl, skillEntityId);
    expect(res.status).not.toBe(200);
  });

  it("a static-token write lands under the nil user", async () => {
    const stored = await mcpTool(baseUrl, "store", {
      entities: [{ entity_type: "note", title: "nil write", content: "nil write" }],
      idempotency_key: `static-bearer-nil-write-${randomUUID()}`,
    });
    const writtenId = entityIdsOf({
      entities:
        (stored.entities as unknown[]) ??
        ((stored.structured as { entities?: unknown[] } | undefined)?.entities ?? []),
    })[0];
    expect(writtenId, JSON.stringify(stored)).toBeTruthy();
    const { db } = await import("../../src/db.js");
    const { data } = await db.from("entities").select("id, user_id").eq("id", writtenId);
    const rows = (data ?? []) as Array<{ user_id: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(NIL_USER_ID);
  });
});
