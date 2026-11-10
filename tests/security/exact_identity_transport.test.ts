import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
} from "../helpers/mcp_http_modern.js";

describe("exact identity transport uses existing tenant scope", () => {
  it("binds REST and MCP to the resolved owner and declines when a worker cannot pin", async () => {
    const env = prepareMcpTestEnv("exact-identity-transport-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "libsql");
    vi.stubEnv("NEOTOMA_DB_READER_WORKERS", "2");
    const app = await bootMcpApp();
    const { getDb } = await import("../../src/repositories/db/connection.js");
    const { WorkerFileDatabase } =
      await import("../../src/repositories/worker/worker_file_database.js");
    const db = await getDb();
    const request = (uid: string) => ({
      read_mode: "exact_identity",
      entity_type: "case_fixture",
      snapshot_filters: { ticket_uid: { op: "eq", value: uid } },
    });
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
    const post = (path: string, body: Record<string, unknown>, token: string) =>
      fetch(app.baseUrl + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...bearer(token) },
        body: JSON.stringify(body),
      });
    const mcp = (body: Record<string, unknown>, token: string) =>
      modernPost(
        app.baseUrl,
        { id: 1, method: "tools/call", params: { name: "retrieve_entities", arguments: body } },
        { headers: bearer(token) }
      );
    const seed = async () => {
      const user = randomUUID();
      const token = randomUUID();
      await db
        .prepare(
          `INSERT INTO mcp_oauth_connections (id,user_id,connection_id,refresh_token,access_token,access_token_expires_at)
           VALUES (?,?,?,?,?,?)`
        )
        .run(
          randomUUID(),
          user,
          `fixture-${randomUUID()}`,
          randomUUID(),
          token,
          "2099-01-01T00:00:00Z"
        );
      return { user, token };
    };
    try {
      if (!(db instanceof WorkerFileDatabase)) throw new Error("Expected real worker libSQL");
      const alice = await seed();
      const bob = await seed();
      const definition = {
        canonical_name_fields: ["ticket_uid"],
        fields: { ticket_uid: { type: "string" }, comments: { type: "string" } },
      };
      await db
        .prepare(
          `INSERT INTO schema_registry (id,entity_type,scope,active,schema_version,schema_definition,reducer_config)
           VALUES (?,'case_fixture','global',1,'1.0',?,?)`
        )
        .run(randomUUID(), JSON.stringify(definition), JSON.stringify({ merge_policies: {} }));

      const bobUid = "manual-bob-only";
      const snapshot = { ticket_uid: bobUid, comments: "Bob only synthetic" };
      const write = await post(
        "/store",
        {
          strict: true,
          observation_source: "human",
          idempotency_key: "fixture-exact-native-transport",
          entities: [{ entity_type: "case_fixture", ...snapshot }],
        },
        bob.token
      );
      const persisted = (await write.json()) as {
        entities?: Array<{ entity_id: string; observation_id: string }>;
      };
      expect(write.status, JSON.stringify(persisted)).toBe(200);
      expect(persisted.entities).toHaveLength(1);
      const [receipt] = persisted.entities!;

      const warnings = vi.spyOn(console, "warn");
      try {
        const denied = await post("/entities/query", request(bobUid), "unregistered-fixture-token");
        expect(denied.status).toBe(401);
        expect(await denied.text()).not.toContain(bobUid);
        expect(warnings.mock.calls.flat().join("\n")).toContain("AuthInvalidToken");
        expect(warnings.mock.calls.flat().join("\n")).not.toContain(bobUid);
      } finally {
        warnings.mockRestore();
      }

      const scoped = {
        owner: "authenticated",
        entity_type: "case_fixture",
        field: "ticket_uid",
        value_sha256: createHash("sha256").update(JSON.stringify(bobUid)).digest("hex"),
      };
      const absent = {
        exact_identity: {
          version: "1",
          state: "absent",
          common_view: true,
          requested_scope: scoped,
        },
      };
      const singleton = {
        exact_identity: {
          version: "1",
          state: "singleton",
          common_view: true,
          requested_scope: scoped,
          entity: {
            entity_id: receipt.entity_id,
            entity_type: "case_fixture",
            snapshot,
            provenance: { ticket_uid: receipt.observation_id, comments: receipt.observation_id },
          },
        },
      };

      const restAlice = await post("/entities/query", request(bobUid), alice.token);
      const restBob = await post("/entities/query", request(bobUid), bob.token);
      expect(restAlice.status).toBe(200);
      expect(await restAlice.json()).toEqual(absent);
      expect(restBob.status).toBe(200);
      expect(restBob.headers.get("cache-control")).toBe("no-store");
      expect(await restBob.json()).toEqual(singleton);
      const query = new URLSearchParams({
        read_mode: "exact_identity",
        entity_type: "case_fixture",
        snapshot_filters: JSON.stringify(request(bobUid).snapshot_filters),
      });
      const get = await fetch(app.baseUrl + "/entities?" + query.toString(), {
        headers: bearer(bob.token),
      });
      expect(get.status).toBe(400);
      const getError = await get.text();
      expect(getError).toContain("requires POST /entities/query");
      expect(getError).not.toContain(bobUid);

      const rpcAlice = await mcp(request(bobUid), alice.token);
      const rpcBob = await mcp(request(bobUid), bob.token);
      expect(rpcAlice.status).toBe(200);
      expect(toolResultJson(rpcAlice.body)).toEqual(absent);
      expect(rpcBob.status).toBe(200);
      expect(toolResultJson(rpcBob.body)).toEqual(singleton);
      const rpcDenied = await mcp(request(bobUid), "unregistered-fixture-token");
      expect(rpcDenied.status).toBe(401);

      // String identity values are data bound to the existing owner. Emails,
      // spaces and Unicode must take the same read path as opaque keys.
      for (const value of ["fixture@example.invalid", "café fixture", "🙂".repeat(256)]) {
        const created = await post(
          "/store",
          {
            strict: true,
            observation_source: "human",
            idempotency_key: "fixture-key-" + createHash("sha256").update(value).digest("hex"),
            entities: [{ entity_type: "case_fixture", ticket_uid: value }],
          },
          bob.token
        );
        expect(created.status).toBe(200);
        const stored = (await created.json()) as { entities: Array<{ entity_id: string }> };
        const rest = await post("/entities/query", request(value), bob.token);
        expect(rest.status).toBe(200);
        expect(await rest.json()).toMatchObject({
          exact_identity: {
            state: "singleton",
            common_view: true,
            entity: { entity_id: stored.entities[0].entity_id, snapshot: { ticket_uid: value } },
          },
        });
        const rpc = await mcp(request(value), bob.token);
        expect(toolResultJson(rpc.body)).toMatchObject({
          exact_identity: {
            state: "singleton",
            common_view: true,
            entity: { entity_id: stored.entities[0].entity_id, snapshot: { ticket_uid: value } },
          },
        });
        const foreign = await post("/entities/query", request(value), alice.token);
        expect(await foreign.json()).toMatchObject({
          exact_identity: { state: "absent", common_view: true },
        });
      }
      for (const value of ["", "x".repeat(257), "key\nvalue", "key\u007fvalue", "key\u0085value"]) {
        const rest = await post("/entities/query", request(value), bob.token);
        expect(rest.status).toBe(400);
        const rpc = await mcp(request(value), bob.token);
        expect(rpc.text).toContain("Exact identity requires");
      }

      const forged = { ...request(bobUid), user_id: bob.user };
      const forgedRest = await post("/entities/query", forged, alice.token);
      expect(forgedRest.status).toBe(400);
      const message = await forgedRest.text();
      expect(message).not.toContain(bob.user);
      expect(message).not.toContain(bobUid);
      const forgedRpc = await mcp(forged, alice.token);
      expect(forgedRpc.text).toContain("Exact identity requires");
      expect(forgedRpc.text).not.toContain(receipt.entity_id);
      const duplicateGet = await fetch(
        app.baseUrl + "/entities?" + query.toString() + "&read_mode=exact_identity",
        {
          headers: bearer(bob.token),
        }
      );
      expect(duplicateGet.status).toBe(400);

      const tooLong = "a".repeat(257);
      const invalid = await post("/entities/query", request(tooLong), bob.token);
      expect(invalid.status).toBe(400);
      expect(await invalid.text()).not.toContain(tooLong);

      const oldQuery = await post("/entities/query", { entity_type: "case_fixture" }, bob.token);
      expect(await oldQuery.json()).toMatchObject({
        read_contract: { coherence: { common_view: false } },
        total: 4,
      });

      const writerTransaction = vi.spyOn(db, "transaction");
      const duringPin = await db.withPinnedReadView(async () => {
        const result = await post("/entities/query", request(bobUid), bob.token);
        expect(result.status).toBe(200);
        return result.json();
      });
      expect(writerTransaction).not.toHaveBeenCalled();
      writerTransaction.mockRestore();
      expect(duringPin).toEqual({
        exact_identity: {
          version: "1",
          state: "unproved",
          common_view: false,
          requested_scope: scoped,
        },
      });
      expect(await (await post("/entities/query", request(bobUid), bob.token)).json()).toEqual(
        singleton
      );
    } finally {
      await app.close();
      await db.close();
      vi.unstubAllEnvs();
      env.restore();
    }
  }, 30_000);
});
