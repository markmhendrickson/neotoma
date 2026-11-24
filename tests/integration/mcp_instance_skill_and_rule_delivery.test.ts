/**
 * Instance-stored skills and standing rules reach a static-token MCP client on
 * every instruction entrance: the legacy `initialize` handshake and the
 * 2026-07-28 stateless `server/discover` RPC.
 *
 * An in-process app on localhost, a temporary data directory and a synthetic
 * static bearer token. Nothing is mocked: the skill and the rule are stored
 * over REST under the shared graph owner (NEOTOMA_SHARED_GRAPH_USER_ID), and
 * every assertion reads the surface a client reads.
 *
 * The last case pins the existing static-token scoping: the same token without
 * the shared-graph setting acts as the local user and sees none of the team's
 * skills; with it, the token sees them.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const TOKEN = "synthetic-skill-rule-delivery-token";
const SHARED_OWNER = randomUUID().toLowerCase();

const SKILL_NAME = "synthetic-delivery-skill";
const SKILL_DESCRIPTION = "Synthetic skill used to check instruction delivery.";
const RULE_TITLE = "Synthetic delivery rule";
const RULE_TEXT = "Synthetic rule body: label every example record as synthetic.";

type InitializeRpc = {
  result?: {
    instructions?: string;
    serverInfo?: {
      _neotoma?: {
        available_skills?: string[];
        skills_unavailable?: boolean;
        standing_rules?: Array<{ title?: string; rule_text?: string }>;
        standing_rules_unavailable?: boolean;
      };
    };
  };
  error?: { message?: string };
};

/** Read a JSON-RPC response from either a JSON body or an SSE stream. */
async function readRpc(res: Response): Promise<InitializeRpc> {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter((l) => l.length > 0);
    return JSON.parse(data[data.length - 1]) as InitializeRpc;
  }
  return JSON.parse(text) as InitializeRpc;
}

/** A legacy `initialize` that carries only an Authorization header. */
async function legacyInitialize(baseUrl: string): Promise<InitializeRpc> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "skill-rule-delivery-test", version: "0.0.0" },
      },
    }),
  });
  const rpc = await readRpc(res);
  expect(rpc.error, `initialize failed: ${rpc.error?.message}`).toBeUndefined();
  return rpc;
}

const AUTH = { headers: { Authorization: `Bearer ${TOKEN}` } };

/** The `[INSTANCE SKILLS]` section of an instructions text, or "" when absent. */
function skillsSection(instructions: string): string {
  const at = instructions.indexOf("[INSTANCE SKILLS]\n");
  return at < 0 ? "" : instructions.slice(at);
}

describe(
  "instance skills and standing rules on static-token MCP entrances",
  { timeout: 60_000 },
  () => {
    let env: McpTestEnv;
    let app: BootedMcpApp;
    const originalShared = process.env.NEOTOMA_SHARED_GRAPH_USER_ID;

    beforeAll(async () => {
      env = prepareMcpTestEnv("neotoma-skill-rule-delivery-");
      process.env.NEOTOMA_BEARER_TOKEN = TOKEN;
      process.env.NEOTOMA_SHARED_GRAPH_USER_ID = SHARED_OWNER;
      app = await bootMcpApp();

      const store = await fetch(`${app.baseUrl}/store`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({
          idempotency_key: "mcp-instance-skill-and-rule-delivery-seed",
          entities: [
            {
              entity_type: "skill",
              name: SKILL_NAME,
              description: SKILL_DESCRIPTION,
              enabled: true,
            },
            {
              entity_type: "standing_rule",
              title: RULE_TITLE,
              rule_text: RULE_TEXT,
              enabled: true,
              priority: 100,
            },
          ],
        }),
      });
      expect(store.status, `store failed: ${await store.clone().text()}`).toBe(200);
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      if (originalShared === undefined) delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
      else process.env.NEOTOMA_SHARED_GRAPH_USER_ID = originalShared;
      env.restore();
    });

    it("(a) legacy initialize leads with the rule and lists the skill", async () => {
      const instructions = (await legacyInitialize(app.baseUrl)).result?.instructions ?? "";
      expect(instructions.startsWith("[STANDING RULES]\n")).toBe(true);
      expect(instructions).toContain(RULE_TEXT);
      expect(skillsSection(instructions)).toContain(`- ${SKILL_NAME}`);
    });

    it("(b) serverInfo._neotoma carries the skill and the rule with no unavailable flags", async () => {
      const meta = (await legacyInitialize(app.baseUrl)).result?.serverInfo?._neotoma;
      expect(meta?.available_skills).toContain(SKILL_NAME);
      expect(meta?.standing_rules?.map((r) => r.rule_text)).toContain(RULE_TEXT);
      expect(meta?.skills_unavailable).toBeUndefined();
      expect(meta?.standing_rules_unavailable).toBeUndefined();
    });

    it("(c) authenticated server/discover carries the rule and the skills section", async () => {
      const reply = await modernPost(
        app.baseUrl,
        { id: "discover", method: "server/discover" },
        AUTH
      );
      expect(reply.status, reply.text).toBe(200);
      const instructions = String(reply.body?.result?.instructions ?? "");
      expect(instructions.startsWith("[STANDING RULES]\n")).toBe(true);
      expect(instructions).toContain(RULE_TEXT);
      expect(skillsSection(instructions)).toContain(`- ${SKILL_NAME}`);
    });

    it("(d) retrieving a skill by a name that is not stored returns an empty list", async () => {
      const reply = await modernPost(
        app.baseUrl,
        {
          id: "retrieve-missing",
          method: "tools/call",
          params: {
            name: "retrieve_entity_by_identifier",
            arguments: {
              entity_type: "skill",
              by: "name",
              identifier: "synthetic-skill-that-is-not-stored",
            },
          },
        },
        AUTH
      );
      expect(reply.status, reply.text).toBe(200);
      expect(reply.body?.result?.isError, reply.text).not.toBe(true);
      const result = toolResultJson(reply.body);
      expect(result.entities, reply.text).toEqual([]);
    });

    it("(e) the static token sees the team's skills only with the shared-graph setting", async () => {
      const withSetting = (await legacyInitialize(app.baseUrl)).result;
      expect(withSetting?.serverInfo?._neotoma?.available_skills).toContain(SKILL_NAME);

      // Same data directory, same token, shared-graph setting removed.
      await app.close();
      delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
      app = await bootMcpApp();
      const withoutSetting = (await legacyInitialize(app.baseUrl)).result;
      expect(withoutSetting?.serverInfo?._neotoma?.available_skills ?? []).not.toContain(
        SKILL_NAME
      );
      expect(skillsSection(withoutSetting?.instructions ?? "")).not.toContain(SKILL_NAME);
      expect(withoutSetting?.instructions ?? "").not.toContain(RULE_TEXT);
    });
  }
);
