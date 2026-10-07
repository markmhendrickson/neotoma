/**
 * Effect test through the real `POST /mcp` route: turn identity sent by an MCP
 * client lands on the recorded write event (docs/subsystems/write_events.md).
 *
 * Boots the real Express app and sends 2026-07-28 stateless requests over HTTP
 * (no handler shortcut), plus one legacy-session call, so the identity passes
 * through every layer a production request does: CORS, the attribution
 * middleware, AAuth admission, the `/mcp` handler's nested context, and the
 * CallTool dispatch scope. Asserts precedence: `_meta` over headers, and a
 * `_meta` that carries only a conversation id replacing the header identity
 * as a whole.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  bootMcpApp,
  modernMeta,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const USER = "cccccccc-0006-4ccc-8ccc-cccccccccccc";
const CONN = "conn-write-events-route";
const RUN = `wer-${Date.now()}`;

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      if (connectionId !== CONN) {
        const error = new Error("Connection not found") as Error & { code?: string };
        error.code = "OAUTH_CONNECTION_NOT_FOUND";
        throw error;
      }
      return { accessToken: `test-access-${connectionId}`, userId: USER };
    }),
  };
});

type ListWriteEvents =
  typeof import("../../src/services/write_events/write_event_query.js").listWriteEvents;

describe("write events through the real /mcp route", () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;
  let listWriteEvents: ListWriteEvents;
  let id = 0;

  beforeAll(async () => {
    env = prepareMcpTestEnv("neotoma-write-events-route-");
    app = await bootMcpApp();
    // The HTTP entrypoint installs the bridge once it is listening; booting
    // `app` directly does not, so install it from the same module graph.
    const bridge = await import("../../src/services/subscriptions/install_subscription_bridge.js");
    bridge.installSubscriptionBridge();
    ({ listWriteEvents } = await import("../../src/services/write_events/write_event_query.js"));
  });

  afterAll(async () => {
    await app.close();
    vi.resetModules();
    env.restore();
  });

  async function storeVia(
    title: string,
    opts: { meta?: Record<string, unknown>; headers?: Record<string, string> }
  ): Promise<string> {
    id += 1;
    const reply = await modernPost(
      app.baseUrl,
      {
        id,
        method: "tools/call",
        params: {
          name: "store",
          arguments: {
            entities: [{ entity_type: "note", title }],
            idempotency_key: `${RUN}-${id}`,
          },
        },
      },
      { connectionId: CONN, meta: { ...modernMeta(), ...(opts.meta ?? {}) }, headers: opts.headers }
    );
    expect(reply.status, reply.text).toBe(200);
    const body = toolResultJson(reply.body) as { entities: Array<{ entity_id: string }> };
    return body.entities[0].entity_id;
  }

  async function createdRecord(entityId: string) {
    for (let i = 0; i < 60; i++) {
      const rows = (await listWriteEvents({ userId: USER, entityId })).write_events;
      const created = rows.find((w) => w.operation === "created");
      if (created) return created;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`no created write event for ${entityId}`);
  }

  it("_meta turn identity lands on the write event", async () => {
    const entityId = await storeVia(`${RUN} meta`, {
      meta: { "io.neotoma/turn_key": `${RUN}:meta`, "io.neotoma/conversation_id": `${RUN}-conv` },
    });
    const rec = await createdRecord(entityId);
    expect(rec.turn_key).toBe(`${RUN}:meta`);
    expect(rec.conversation_id).toBe(`${RUN}-conv`);
    expect(rec.turn_source).toBe("mcp_meta");
  });

  it("header turn identity lands on the write event", async () => {
    const entityId = await storeVia(`${RUN} header`, {
      headers: {
        "X-Neotoma-Turn-Key": `${RUN}:hdr`,
        "X-Neotoma-Conversation-Id": `${RUN}-hconv`,
      },
    });
    const rec = await createdRecord(entityId);
    expect(rec.turn_key).toBe(`${RUN}:hdr`);
    expect(rec.conversation_id).toBe(`${RUN}-hconv`);
    expect(rec.turn_source).toBe("header");
  });

  it("_meta wins over the header when both are sent", async () => {
    const entityId = await storeVia(`${RUN} both`, {
      meta: { "io.neotoma/turn_key": `${RUN}:meta-wins` },
      headers: { "X-Neotoma-Turn-Key": `${RUN}:hdr-loses` },
    });
    const rec = await createdRecord(entityId);
    expect(rec.turn_key).toBe(`${RUN}:meta-wins`);
    expect(rec.turn_source).toBe("mcp_meta");
  });

  it("a _meta with only a conversation id replaces the header identity as a whole", async () => {
    const entityId = await storeVia(`${RUN} conv-only`, {
      meta: { "io.neotoma/conversation_id": `${RUN}-meta-conv` },
      headers: { "X-Neotoma-Turn-Key": `${RUN}:hdr-dropped` },
    });
    const rec = await createdRecord(entityId);
    expect(rec.conversation_id).toBe(`${RUN}-meta-conv`);
    expect(rec.turn_key).toBeUndefined();
    expect(rec.turn_source).toBe("mcp_meta");
  });

  it("a malformed header is dropped, not stored", async () => {
    const entityId = await storeVia(`${RUN} malformed`, {
      headers: { "X-Neotoma-Turn-Key": "this is prose, not a key" },
    });
    const rec = await createdRecord(entityId);
    expect(rec.turn_key).toBeUndefined();
    expect(rec.turn_source).toBeUndefined();
  });

  it("CORS preflight allows the turn headers", async () => {
    const res = await fetch(`${app.baseUrl}/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5195",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-neotoma-turn-key,x-neotoma-conversation-id",
      },
    });
    const allowed = (res.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    expect(allowed).toContain("x-neotoma-turn-key");
    expect(allowed).toContain("x-neotoma-conversation-id");
  });
});
