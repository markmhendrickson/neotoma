/**
 * An empty skill lookup by name says which graph was read, on both surfaces.
 *
 * Session instructions can name a skill that the reading user's graph does not
 * hold. `retrieve_entity_by_identifier` with `entity_type: "skill"` used to
 * return a bare `{entities: [], total: 0}`. It now carries a `hint` naming the
 * caller's user id (never stored content). Boots the real Express app for the
 * REST path and the real NeotomaServer for the MCP path and asserts both carry
 * the same hint; a found skill and a non-skill miss carry none.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db, getServiceRoleClient } from "../../src/db.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { normalizeEntityValue } from "../../src/services/entity_resolution.js";
import { skillNotFoundHint } from "../../src/shared/action_handlers/entity_identifier_handler.js";

const USER_ID = LOCAL_DEV_USER_ID;
const API_PORT = 18263;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const MISSING_NAME = `absent-skill-${Date.now()}`;
const PRESENT_NAME = `present-skill-${Date.now()}`;
const PRESENT_ID = `ent_skillhint${Date.now().toString(16)}`;
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000002";
const OTHER_USER_NAME = `other-user-skill-${Date.now()}`;
const OTHER_USER_SKILL_ID = `ent_0${Date.now().toString(16)}`;
const MISSING_ENTITY_ID = `ent_f${Date.now().toString(16)}`;

type LookupBody = { entities: unknown[]; total: number; hint?: string };

async function restLookup(body: Record<string, unknown>): Promise<LookupBody> {
  const res = await fetch(`${API_BASE}/retrieve_entity_by_identifier`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as LookupBody;
}

async function mcpLookup(
  server: NeotomaServer,
  args: Record<string, unknown>
): Promise<LookupBody> {
  const out = await (
    server as unknown as {
      retrieveEntityByIdentifier: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).retrieveEntityByIdentifier(args);
  return JSON.parse(out.content[0]!.text) as LookupBody;
}

describe("skill lookup by name: not-found hint (REST and MCP)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const { error } = await getServiceRoleClient()
      .from("entities")
      .insert([
        {
          id: PRESENT_ID,
          user_id: USER_ID,
          entity_type: "skill",
          canonical_name: normalizeEntityValue("skill", PRESENT_NAME),
        },
        {
          id: OTHER_USER_SKILL_ID,
          user_id: OTHER_USER_ID,
          entity_type: "skill",
          canonical_name: normalizeEntityValue("skill", OTHER_USER_NAME),
        },
      ]);
    expect(error).toBeNull();
  });

  afterAll(async () => {
    await db.from("entity_snapshots").delete().eq("entity_id", PRESENT_ID);
    await db.from("entities").delete().eq("id", PRESENT_ID);
    await db.from("entity_snapshots").delete().eq("entity_id", OTHER_USER_SKILL_ID);
    await db.from("entities").delete().eq("id", OTHER_USER_SKILL_ID);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("an empty skill fetch carries the hint on REST and MCP alike", async () => {
    const args = { identifier: MISSING_NAME, entity_type: "skill" };
    const rest = await restLookup(args);
    const mcp = await mcpLookup(server, args);
    for (const body of [rest, mcp]) {
      expect(body.total).toBe(0);
      expect(body.entities).toEqual([]);
      expect(body.hint).toBe(skillNotFoundHint(USER_ID));
      expect(body.hint).toContain("no skill with that name is stored in the graph you are reading");
      expect(body.hint).toContain(`user_id ${USER_ID}`);
      expect(body.hint).toContain("get_authenticated_user");
    }
    expect(rest.hint).toBe(mcp.hint);
  });

  it("a found skill carries no hint", async () => {
    const args = { identifier: PRESENT_NAME, entity_type: "skill" };
    for (const body of [await restLookup(args), await mcpLookup(server, args)]) {
      expect(body.total).toBe(1);
      expect(body.hint).toBeUndefined();
    }
  });

  it("an empty lookup of another type is unchanged (no hint)", async () => {
    const args = { identifier: MISSING_NAME, entity_type: "contact" };
    for (const body of [await restLookup(args), await mcpLookup(server, args)]) {
      expect(body.total).toBe(0);
      expect(body.hint).toBeUndefined();
    }
  });

  it("preserves the entity-id hint for an id-shaped skill lookup", async () => {
    const args = { identifier: MISSING_ENTITY_ID, entity_type: "skill" };
    for (const body of [await restLookup(args), await mcpLookup(server, args)]) {
      expect(body.total).toBe(0);
      expect(body.entities).toEqual([]);
      expect(body.hint).toContain("retrieve_entity_snapshot(entity_id=…)");
      expect(body.hint).not.toContain("no skill with that name");
    }
  });

  it("an other user's skill yields a hint naming only the caller", async () => {
    const args = { identifier: OTHER_USER_NAME, entity_type: "skill" };
    for (const body of [await restLookup(args), await mcpLookup(server, args)]) {
      expect(body.total).toBe(0);
      expect(body.entities).toEqual([]);
      expect(body.hint).toBe(skillNotFoundHint(USER_ID));
      expect(body.hint).toContain(`user_id ${USER_ID}`);
      expect(body.hint).not.toContain(OTHER_USER_ID);
      expect(body.hint).not.toContain(OTHER_USER_NAME);
    }
  });
});
