import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { HttpTransport } from "../../packages/client/src/http.js";
import { LocalTransport } from "../../packages/client/src/local.js";
import { holdPinnedWorker } from "../helpers/worker_lifetime_barrier.js";

import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
} from "../helpers/mcp_http_modern.js";
import { execFileLocal } from "../helpers/cli_local_target.js";

const run = execFileLocal;

async function requestCli(
  baseUrl: string,
  home: string,
  token: string,
  input: Record<string, unknown>,
  flag: "body" | "params"
) {
  const result = await run(
    process.execPath,
    [
      "dist/cli/index.js",
      "--no-log-file",
      "--json",
      "--base-url",
      baseUrl,
      "request",
      "--operation",
      "queryEntities",
      `--${flag}`,
      JSON.stringify(flag === "params" ? { body: input } : input),
    ],
    {
      timeout: 20_000,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        NEOTOMA_BEARER_TOKEN: token,
        NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
      },
    }
  );
  const output = JSON.parse(result.stdout);
  expect(output._neotoma).toEqual({ base_url: baseUrl, data_dir: null, transport: "api" });
  const { _neotoma, ...proof } = output;
  return proof;
}

describe("exact identity transport uses existing tenant scope", () => {
  it("binds REST, MCP, CLI and SDK proof effects to the owner and available read view", async () => {
    const env = prepareMcpTestEnv("exact-identity-transport-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "libsql");
    vi.stubEnv("NEOTOMA_DB_READER_WORKERS", "2");
    vi.stubEnv("NEOTOMA_DB_ORPHAN_GRACE_MS", "20");
    const app = await bootMcpApp();
    const { getDb } = await import("../../src/repositories/db/connection.js");
    const { WorkerFileDatabase } =
      await import("../../src/repositories/worker/worker_file_database.js");
    const db = await getDb();
    let replacement: InstanceType<typeof WorkerFileDatabase> | undefined;
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

      // Exercise the access-log sink, including the router's normal equivalent
      // spellings and implicit HEAD entrance, using synthetic owned input.
      const accessLog = vi.spyOn(process.stdout, "write");
      try {
        const route = "/entities";
        for (const method of ["GET", "HEAD"]) {
          for (const path of [route, route + "/", route.toUpperCase(), "/Entities/"]) {
            for (const repeated of [false, true]) {
              accessLog.mockClear();
              const params = new URLSearchParams({
                read_mode: "exact_identity",
                entity_type: "case_fixture",
                snapshot_filters: JSON.stringify(request(bobUid).snapshot_filters),
              });
              if (repeated) params.append("read_mode", "exact_identity");
              const response = await fetch(app.baseUrl + path + "?" + params, {
                method,
                headers: bearer(bob.token),
              });
              const text = await response.text();
              expect(response.status).toBe(400);
              if (method === "GET") expect(text).toContain("requires POST");
              expect(text).not.toContain(bobUid);
              expect(accessLog.mock.calls.map(([chunk]) => String(chunk)).join("\n")).not.toContain(
                bobUid
              );
            }
          }
        }
        accessLog.mockClear();
        const ordinary = await fetch(app.baseUrl + "/entities?entity_type=case_fixture", {
          headers: bearer(bob.token),
        });
        await ordinary.text();
        expect(accessLog.mock.calls.map(([chunk]) => String(chunk)).join("\n")).toContain(
          "/entities?entity_type=case_fixture"
        );
      } finally {
        accessLog.mockRestore();
      }

      const { createOperations } = await import("../../src/core/operations.js");
      const local = (userId: string) =>
        new LocalTransport({ userId, operations: createOperations({ userId }) });
      const http = (token: string) => new HttpTransport({ baseUrl: app.baseUrl, token });
      const clients = [
        { name: "SDK HTTP", owner: http(bob.token), foreign: http(alice.token) },
        { name: "SDK local", owner: local(bob.user), foreign: local(alice.user) },
      ];
      const cli = async (
        token: string,
        input: Record<string, unknown>,
        flag: "body" | "params"
      ) => {
        return requestCli(app.baseUrl, env.tmpRoot, token, input, flag);
      };
      for (const client of clients) {
        expect(await client.owner.retrieveEntities(request(bobUid)), client.name).toEqual(
          singleton
        );
        expect(await client.foreign.retrieveEntities(request(bobUid)), client.name).toEqual(absent);
        await expect(
          client.foreign.retrieveEntities({ ...request(bobUid), user_id: bob.user })
        ).rejects.toThrow();
      }
      await expect(
        http("unregistered-fixture-token").retrieveEntities(request(bobUid))
      ).rejects.toThrow();
      for (const flag of ["body", "params"] as const) {
        expect(await cli(bob.token, request(bobUid), flag)).toEqual(singleton);
        expect(await cli(alice.token, request(bobUid), flag)).toEqual(absent);
        await expect(
          cli(alice.token, { ...request(bobUid), user_id: bob.user }, flag)
        ).rejects.toThrow();
        await expect(cli("unregistered-fixture-token", request(bobUid), flag)).rejects.toThrow();
      }

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
        const error = await rest.text();
        expect(error).toContain("1–64");
        expect(error).toContain("1–256");
        const rpc = await mcp(request(value), bob.token);
        expect(rpc.text).toContain("Exact identity requires");
        expect(rpc.text).toContain("1–256");
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
      await db.withPinnedReadView(async () => {
        const unavailable = {
          exact_identity: {
            version: "1",
            state: "unproved",
            common_view: false,
            requested_scope: scoped,
          },
        };
        const results = await Promise.all([
          ...clients.map((client) => client.owner.retrieveEntities(request(bobUid))),
          cli(bob.token, request(bobUid), "body"),
          cli(bob.token, request(bobUid), "params"),
        ]);
        for (const result of results) expect(result).toEqual(unavailable);
      }, 2000);
      expect(await (await post("/entities/query", request(bobUid), bob.token)).json()).toEqual(
        singleton
      );

      // Retired physical custody must survive the existing cached-handle reset.
      // A fulfilled termination request is deliberately not an exit in this test.
      let held: ReturnType<typeof holdPinnedWorker> | undefined;
      const pin = db.withPinnedReadView(async (view) => {
        await view.prepare("SELECT 1").get();
        held = holdPinnedWorker(db);
        return held.pending;
      });
      await vi.waitFor(() => expect(held && Atomics.load(held.flags, 0)).toBe(1));
      const originalTerminate = held!.worker.terminate.bind(held!.worker);
      const termination = vi.spyOn(held!.worker, "terminate").mockResolvedValue(0);
      let exited = false;
      held!.worker.once("exit", () => {
        exited = true;
      });
      let staleClosed = false;
      const closeSpy = vi.spyOn(db, "close");
      try {
        await expect(pin).rejects.toThrow(/budget/);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(termination).not.toHaveBeenCalled();
        const { clearDbCache } = await import("../../src/repositories/db/connection.js");
        clearDbCache();
        const staleClose = closeSpy.mock.results[0].value as Promise<void>;
        staleClose.then(() => {
          staleClosed = true;
        });
        expect(db.close()).toBe(staleClose);
        const fresh = await getDb();
        if (!(fresh instanceof WorkerFileDatabase)) throw new Error("Expected replacement libSQL");
        replacement = fresh;
        expect(fresh).not.toBe(db);
        await fresh.prepare("SELECT 2 AS n").get();
        await fresh.prepare("CREATE TABLE resource_writer_control (n INTEGER)").run();
        await fresh.prepare("INSERT INTO resource_writer_control VALUES (7)").run();
        expect(await fresh.prepare("SELECT n FROM resource_writer_control").get()).toEqual({
          n: 7,
        });
        const scans = vi.fn();
        const originalPin = fresh.withPinnedReadView.bind(fresh);
        const dispatch = vi.spyOn(fresh, "withPinnedReadView").mockImplementation((operation) =>
          originalPin((view) => {
            scans();
            return operation(view);
          })
        );
        const unavailable = {
          exact_identity: {
            version: "1",
            state: "unproved",
            common_view: false,
            requested_scope: scoped,
          },
        };
        try {
          const results = await Promise.all([
            post("/entities/query", request(bobUid), bob.token).then((r) => r.json()),
            mcp(request(bobUid), bob.token).then((r) => toolResultJson(r.body)),
            ...clients.map((client) => client.owner.retrieveEntities(request(bobUid))),
            cli(bob.token, request(bobUid), "body"),
            cli(bob.token, request(bobUid), "params"),
          ]);
          for (const result of results) expect(result).toEqual(unavailable);
          expect(scans).not.toHaveBeenCalled();
          expect(exited).toBe(false);
          expect(staleClosed).toBe(false);
          expect(termination).not.toHaveBeenCalled();
          held!.release();
          await vi.waitFor(() => expect(termination).toHaveBeenCalled());
          expect(exited).toBe(false);
          expect(staleClosed).toBe(false);
          expect(await (await post("/entities/query", request(bobUid), bob.token)).json()).toEqual(
            unavailable
          );
          expect(scans).not.toHaveBeenCalled();
          termination.mockRestore();
          await originalTerminate();
          await staleClose;
          expect(exited).toBe(true);
          expect(staleClosed).toBe(true);
          expect(await (await post("/entities/query", request(bobUid), bob.token)).json()).toEqual(
            singleton
          );
          expect(scans).toHaveBeenCalledTimes(1);
        } finally {
          dispatch.mockRestore();
        }
      } finally {
        held!.release();
        termination.mockRestore();
        await originalTerminate();
        closeSpy.mockRestore();
      }
    } finally {
      await app.close();
      await db.close();
      await replacement?.close();
      vi.unstubAllEnvs();
      env.restore();
    }
  }, 30_000);

  it("returns unproved on direct SQLite through every exposing surface", async () => {
    const env = prepareMcpTestEnv("exact-identity-sqlite-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "sqlite");
    const app = await bootMcpApp();
    const { getDb } = await import("../../src/repositories/db/connection.js");
    const { AsyncSqliteDatabase } = await import("../../src/repositories/sqlite/sqlite_driver.js");
    const db = await getDb();
    const user = randomUUID(),
      token = randomUUID();
    const input = {
      read_mode: "exact_identity",
      entity_type: "case_fixture",
      snapshot_filters: { ticket_uid: { op: "eq", value: "sqlite-owned-fixture" } },
    };
    const expected = {
      exact_identity: {
        version: "1",
        state: "unproved",
        common_view: false,
        requested_scope: {
          owner: "authenticated",
          entity_type: "case_fixture",
          field: "ticket_uid",
          value_sha256: createHash("sha256")
            .update(JSON.stringify(input.snapshot_filters.ticket_uid.value))
            .digest("hex"),
        },
      },
    };
    try {
      expect(db).toBeInstanceOf(AsyncSqliteDatabase);
      await db
        .prepare(
          `INSERT INTO mcp_oauth_connections
        (id,user_id,connection_id,refresh_token,access_token,access_token_expires_at)
        VALUES (?,?,?,?,?,?)`
        )
        .run(randomUUID(), user, "sqlite-fixture", randomUUID(), token, "2099-01-01T00:00:00Z");
      const http = new HttpTransport({ baseUrl: app.baseUrl, token });
      const { createOperations } = await import("../../src/core/operations.js");
      const local = new LocalTransport({
        userId: user,
        operations: createOperations({ userId: user }),
      });
      const rest = await fetch(app.baseUrl + "/entities/query", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      expect(rest.status).toBe(200);
      expect(await rest.json()).toEqual(expected);
      const rpc = await modernPost(
        app.baseUrl,
        { id: 1, method: "tools/call", params: { name: "retrieve_entities", arguments: input } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(rpc.status).toBe(200);
      expect(toolResultJson(rpc.body)).toEqual(expected);
      expect(await http.retrieveEntities(input)).toEqual(expected);
      expect(await local.retrieveEntities(input)).toEqual(expected);
      for (const flag of ["body", "params"] as const) {
        expect(await requestCli(app.baseUrl, env.tmpRoot, token, input, flag)).toEqual(expected);
      }
    } finally {
      await app.close();
      await db.close();
      vi.unstubAllEnvs();
      env.restore();
    }
  }, 30_000);
});
