/** Negative restored-state fixtures, never positive exact persistence or activation. */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { getDb, withExistingLifecycleDatabase } from "../../src/repositories/db/connection.js";
import { createAcceptedIdentityBinding } from "../../src/services/entity_identity_contract.js";
import {
  createCorrection,
  createCorrectionWithVersionPrecondition,
  findCommittedCorrectionReplay,
} from "../../src/services/correction.js";
import { generateEntityId, entityIdTenantSalt } from "../../src/services/entity_resolution.js";
import { splitEntity } from "../../src/services/entity_split.js";
import {
  PARITY_USER_ID,
  callHttp,
  makeMcpServer,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../../dist/cli/index.js", import.meta.url));
const owner = PARITY_USER_ID;
const exactType = "synthetic_restored_mutation_exact";
const ordinaryType = "synthetic_mutation_ordinary";
const wrongOwner = "synthetic_mutation_foreign";
const at = "2020-01-01T00:00:00.000Z";
const later = "2020-01-02T00:00:00.000Z";
const tables = [
  "schema_registry",
  "entities",
  "observations",
  "entity_snapshots",
  "relationship_observations",
  "relationship_snapshots",
  "entity_merges",
  "entity_splits",
  "raw_fragments",
  "sources",
];

async function image(database: AsyncSqliteDatabase) {
  return Promise.all(
    tables.map(async (table) => [
      table,
      await database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ])
  );
}

/** Observe attempts while delegating every statement to the real native driver. */
function observeWrites(database: AsyncSqliteDatabase) {
  const writes: string[] = [];
  const prepare = database.prepare.bind(database);
  database.prepare = (sql) => {
    const statement = prepare(sql);
    return {
      run: (...params) => {
        if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) writes.push(sql);
        return statement.run(...params);
      },
      get: (...params) => statement.get(...params),
      all: (...params) => statement.all(...params),
    };
  };
  return writes;
}

async function fixture() {
  const template = new AsyncSqliteDatabase(":memory:");
  const database = new AsyncSqliteDatabase(":memory:");
  try {
    await ensureSchema(template);
    // Copy table definitions only into an unsupported OLD database. No native
    // guard is disabled/removed and no activation bit is ever enabled.
    const ddl = (await template
      .prepare(
        "SELECT m.sql FROM sqlite_master m JOIN pragma_table_list p ON m.name=p.name WHERE m.type='table' AND p.type='table' AND m.name NOT LIKE 'sqlite_%' AND m.sql IS NOT NULL"
      )
      .all()) as Array<{ sql: string }>;
    for (const row of ddl) await database.exec(row.sql);
    const contract = {
      version: "2" as const,
      mode: "exact_utf8" as const,
      namespace: "synthetic:restored:mutation:v2",
      canonical_name_fields: ["code"],
    };
    const binding = createAcceptedIdentityBinding({
      anchorSchemaId: "synthetic_restored_schema",
      entityType: exactType,
      scope: "global",
      userId: null,
      tenantScopedEntityIds: true,
      contract,
    });
    await database
      .prepare(
        "INSERT INTO schema_registry(id,entity_type,schema_version,schema_definition,reducer_config,active,scope,user_id,identity_binding) VALUES(?,?,'1.0.0',?,'{}',0,'global',NULL,?)"
      )
      .run(
        binding.anchor_schema_id,
        exactType,
        JSON.stringify({
          fields: { code: { type: "string" }, title: { type: "string" } },
          canonical_name_fields: ["code"],
          identity_contract: contract,
        }),
        JSON.stringify(binding)
      );
    await database
      .prepare(
        "INSERT INTO schema_registry(id,entity_type,schema_version,schema_definition,reducer_config,active,scope,user_id) VALUES('synthetic_ordinary_schema',?,'1.0.0',?, ?,1,'global',NULL)"
      )
      .run(
        ordinaryType,
        JSON.stringify({
          fields: { name: { type: "string" }, title: { type: "string" } },
          canonical_name_fields: ["name"],
        }),
        JSON.stringify({
          merge_policies: { name: { strategy: "last_write" }, title: { strategy: "last_write" } },
        })
      );
    for (const [id, type, user, record] of [
      ["ent_restored_exact", exactType, owner],
      ["ent_foreign_exact", exactType, wrongOwner],
      [
        generateEntityId(ordinaryType, "synthetic computed collision", entityIdTenantSalt(owner)),
        exactType,
        owner,
      ],
      ["ent_111111111111111111111111", ordinaryType, owner],
      ["ent_ordinary_target", ordinaryType, owner],
      ["ent_restored_record", ordinaryType, owner, '{"unsupported":true}'],
      ["ent_foreign_record", ordinaryType, wrongOwner, '{"unsupported":true}'],
      [
        generateEntityId(ordinaryType, "synthetic computed record", entityIdTenantSalt(owner)),
        ordinaryType,
        owner,
        '{"unsupported":true}',
      ],
    ]) {
      await database
        .prepare(
          "INSERT INTO entities(id,entity_type,canonical_name,user_id,identity_record) VALUES(?,?,?,?,?)"
        )
        .run(id, type, id, user, record ?? null);
      for (const [suffix, observed] of [
        ["old", at],
        ["new", later],
      ])
        await database
          .prepare(
            "INSERT INTO observations(id,entity_id,entity_type,schema_version,observed_at,created_at,source_priority,fields,user_id) VALUES(?,?,?,'1.0.0',?,?,100,?,?)"
          )
          .run(
            `${id}_${suffix}`,
            id,
            type,
            observed,
            observed,
            JSON.stringify({ name: id, title: suffix }),
            user
          );
    }
    await database
      .prepare(
        "INSERT INTO entity_splits(id,user_id,source_entity_id,new_entity_id,predicate,split_by,observations_rewritten,idempotency_key,created_at) VALUES('synthetic_restored_split',?,'ent_restored_exact','ent_ordinary_target',?,'fixture',1,'synthetic_restored_key',?)"
      )
      .run(owner, JSON.stringify({ observed_at_gte: later }), at);
    await database
      .prepare(
        "INSERT INTO entity_splits(id,user_id,source_entity_id,new_entity_id,predicate,split_by,observations_rewritten,idempotency_key,created_at) VALUES('synthetic_restored_record_split',?,'ent_restored_record','ent_ordinary_target',?,'fixture',1,'synthetic_restored_record_key',?)"
      )
      .run(owner, JSON.stringify({ observed_at_gte: later }), at);
    await database
      .prepare(
        "UPDATE observations SET idempotency_key='synthetic_restored_correction' WHERE id='ent_restored_exact_new'"
      )
      .run();
    await ensureSchema(database);
    // Positive instrument/native-guard checks on this very database.
    expect(await database.prepare("SELECT COUNT(*) AS n FROM entities").get()).toEqual({ n: 8 });
    expect(
      await database
        .prepare("SELECT active FROM schema_registry WHERE entity_type=?")
        .get(exactType)
    ).toEqual({ active: 0 });
    await expect(
      database
        .prepare(
          "INSERT INTO entities(id,entity_type,canonical_name,user_id) VALUES('ent_forbidden',?,'forbidden',?)"
        )
        .run(exactType, owner)
    ).rejects.toThrow("EXACT_IDENTITY_ACTIVATION_UNAVAILABLE");
    await expect(
      database
        .prepare("UPDATE entities SET identity_record=NULL WHERE id='ent_restored_record'")
        .run()
    ).rejects.toThrow("EXACT_IDENTITY_RECORD_IMMUTABLE");
    return database;
  } catch (error) {
    await database.close();
    throw error;
  } finally {
    await template.close();
  }
}

async function registered(name: string, args: Record<string, unknown>) {
  type Handler = (
    request: unknown,
    extra: unknown
  ) => Promise<{ content: Array<{ text: string }> }>;
  const server = makeMcpServer() as unknown as {
    mcpServer: { server: { _requestHandlers: Map<string, Handler> } };
  };
  const handler = server.mcpServer.server._requestHandlers.get("tools/call");
  if (!handler) throw new Error("tools/call absent");
  const result = await handler({ method: "tools/call", params: { name, arguments: args } }, {});
  return JSON.parse(result.content[0].text);
}
function domain(value: Record<string, unknown>) {
  const { timestamp: _timestamp, trace_id: _traceId, ...rest } = value;
  return rest;
}
async function cliError(base: string, operation: string, body: Record<string, unknown>) {
  const home = mkdtempSync(join(tmpdir(), "identity-mutation-cli-"));
  mkdirSync(join(home, "data"));
  try {
    const result = await execute(
      process.execPath,
      [
        cli,
        "--json",
        "--api-only",
        "--no-log-file",
        "--base-url",
        base,
        "request",
        "--operation",
        operation,
        "--skip-auth",
        "--body",
        JSON.stringify(body),
      ],
      {
        cwd: home,
        env: {
          PATH: process.env.PATH,
          HOME: home,
          USERPROFILE: home,
          TMPDIR: home,
          NODE_ENV: "test",
          NEOTOMA_ENV: "development",
          NEOTOMA_DATA_DIR: join(home, "data"),
          NEOTOMA_SQLITE_PATH: join(home, "data", "state.db"),
          NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
          NEOTOMA_API_ONLY: "1",
          NEOTOMA_ICON_GENERATION_ENABLED: "false",
          OPENAI_API_KEY: "test-openai-key",
          ...(process.env.NODE_OPTIONS ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {}),
          ...(process.env.SCHEMA_GATE_NETWORK_JOURNAL
            ? { SCHEMA_GATE_NETWORK_JOURNAL: process.env.SCHEMA_GATE_NETWORK_JOURNAL }
            : {}),
          ...(process.env.SCHEMA_GATE_IPC_ROOT
            ? { SCHEMA_GATE_IPC_ROOT: process.env.SCHEMA_GATE_IPC_ROOT }
            : {}),
        },
        timeout: 30000,
      }
    ).catch((error: { code: number; stderr: string }) => error);
    expect(result).toHaveProperty("code", 1);
    const line = result.stderr.split("\n").find((line) => line.startsWith('{"error":'));
    expect(line).toBeTruthy();
    return JSON.parse(line!);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const splitBody = (source = "ent_restored_exact", target?: string, newType = ordinaryType) => ({
  source_entity_id: source,
  predicate: { observed_at_gte: later },
  new_entity: {
    entity_type: newType,
    canonical_name: "synthetic split target",
    ...(target ? { target_entity_id: target } : {}),
  },
  idempotency_key: randomUUID(),
});

it("refuses restored exact correction/merge/split through natural HTTP, registered MCP and compiled CLI before any effects", async () => {
  const database = await fixture();
  try {
    await withExistingLifecycleDatabase(database, async () => {
      expect(await getDb()).toBe(database);
      const writes = observeWrites(database);
      const server = await startOfflineServer();
      try {
        // Complete the normal local-auth bootstrap before measuring domain
        // mutation attempts; the owned ordinary result proves this handle.
        const warm = await callHttp(server.base, "/retrieve_entity_by_identifier", {
          entity_type: ordinaryType,
          identifier: "ent_111111111111111111111111",
        });
        expect(warm.status).toBe(200);
        expect(JSON.stringify(warm.json)).toContain("ent_111111111111111111111111");
        const cases = [
          [
            "/corrections/transaction",
            "correct_transaction",
            "correctTransaction",
            {
              idempotency_key: randomUUID(),
              entities: ["ent_111111111111111111111111", "ent_restored_exact"].map((entity_id) => ({
                entity_id,
                entity_type: entity_id === "ent_restored_exact" ? exactType : ordinaryType,
                expected_observation_count: 2,
                expected_snapshot: {},
                changes: [{ field: "title", value: "transaction replacement" }],
              })),
            },
          ],
          [
            "/correct",
            "correct",
            "correct",
            {
              entity_id: "ent_restored_exact",
              entity_type: exactType,
              field: "title",
              value: "unreturned replacement",
              idempotency_key: randomUUID(),
            },
          ],
          [
            "/entities/merge",
            "merge_entities",
            "mergeEntities",
            { from_entity_id: "ent_restored_exact", to_entity_id: "ent_ordinary_target" },
          ],
          [
            "/entities/merge",
            "merge_entities",
            "mergeEntities",
            { from_entity_id: "ent_111111111111111111111111", to_entity_id: "ent_restored_exact" },
          ],
          [
            "/corrections/transaction",
            "correct_transaction",
            "correctTransaction",
            {
              idempotency_key: randomUUID(),
              entities: ["ent_111111111111111111111111", "ent_restored_record"].map(
                (entity_id) => ({
                  entity_id,
                  entity_type: ordinaryType,
                  expected_observation_count: 2,
                  expected_snapshot: {},
                  changes: [{ field: "title", value: "record transaction replacement" }],
                })
              ),
            },
          ],
          [
            "/entities/split",
            "split_entity",
            "splitEntity",
            {
              ...splitBody("ent_111111111111111111111111", "ent_ordinary_target"),
              idempotency_key: "synthetic_restored_record_key",
            },
          ],
          [
            "/correct",
            "correct",
            "correct",
            {
              entity_id: "ent_restored_record",
              entity_type: ordinaryType,
              field: "title",
              value: "record replacement",
              idempotency_key: randomUUID(),
            },
          ],
          [
            "/entities/merge",
            "merge_entities",
            "mergeEntities",
            { from_entity_id: "ent_restored_record", to_entity_id: "ent_ordinary_target" },
          ],
          [
            "/entities/merge",
            "merge_entities",
            "mergeEntities",
            { from_entity_id: "ent_111111111111111111111111", to_entity_id: "ent_restored_record" },
          ],
          ["/entities/split", "split_entity", "splitEntity", splitBody("ent_restored_record")],
          [
            "/entities/split",
            "split_entity",
            "splitEntity",
            splitBody("ent_111111111111111111111111", "ent_restored_record"),
          ],
          [
            "/entities/split",
            "split_entity",
            "splitEntity",
            {
              ...splitBody("ent_111111111111111111111111"),
              new_entity: {
                entity_type: ordinaryType,
                canonical_name: "synthetic computed record",
              },
            },
          ],
          ["/entities/split", "split_entity", "splitEntity", splitBody()],
          [
            "/entities/split",
            "split_entity",
            "splitEntity",
            {
              ...splitBody("ent_111111111111111111111111"),
              new_entity: {
                entity_type: ordinaryType,
                canonical_name: "synthetic computed collision",
              },
            },
          ],
          [
            "/entities/split",
            "split_entity",
            "splitEntity",
            splitBody("ent_111111111111111111111111", "ent_restored_exact"),
          ],
          [
            "/entities/split",
            "split_entity",
            "splitEntity",
            splitBody("ent_111111111111111111111111", undefined, exactType),
          ],
          [
            "/entities/split",
            "split_entity",
            "splitEntity",
            {
              ...splitBody("ent_111111111111111111111111", "ent_ordinary_target"),
              idempotency_key: "synthetic_restored_key",
            },
          ],
        ] as const;
        for (const [route, name, operation, body] of cases) {
          const before = await image(database);
          writes.length = 0;
          const http = await callHttp(server.base, route, body);
          expect(await image(database), `${name} HTTP persisted partial effects`).toEqual(before);
          expect(http.status, route).toBe(400);
          expect(http.json).toMatchObject({
            error_code: "VALIDATION_INVALID_FORMAT",
            details: { hint: expect.any(String) },
          });
          const mcp = (await registered(name, body).catch((error: unknown) => error)) as {
            code: number;
            data: Record<string, unknown>;
          };
          expect(mcp.code).toBe(-32602);
          expect(domain(mcp.data)).toEqual(domain(http.json));
          const failure = await cliError(server.base, operation, body);
          expect(failure.hint).toMatchObject({
            code: http.json.error_code,
            hint: (http.json.details as Record<string, unknown>).hint,
          });
          expect(await image(database), `${name} persisted partial effects`).toEqual(before);
          expect(writes, `${name} attempted mutation before refusal`).toEqual([]);
          expect(JSON.stringify(http.json)).not.toContain("unreturned replacement");
        }
        // Ordinary successful HTTP mutation proves server queries use this exact
        // fixture handle, rather than measuring an unrelated global database.
        const ordinary = await callHttp(server.base, "/entities/merge", {
          from_entity_id: "ent_111111111111111111111111",
          to_entity_id: "ent_ordinary_target",
        });
        expect(ordinary.status).toBe(200);
        expect(ordinary.json.observations_moved).toBe(2);
        expect(writes.some((sql) => sql.includes("UPDATE observations"))).toBe(true);
        expect(
          await database
            .prepare(
              "SELECT merged_to_entity_id FROM entities WHERE id='ent_111111111111111111111111'"
            )
            .get()
        ).toEqual({ merged_to_entity_id: "ent_ordinary_target" });
      } finally {
        await stopServer(server.server);
      }
    });
  } finally {
    await database.close();
  }
}, 120000);

it("refuses direct correction/CAS and split before target insertion, with owner and ordinary replay controls", async () => {
  const database = await fixture();
  try {
    await withExistingLifecycleDatabase(database, async () => {
      const before = await image(database);
      const correction = {
        entity_id: "ent_restored_exact",
        entity_type: exactType,
        field: "title",
        value: "changed",
        schema_version: "1.0.0",
        user_id: owner,
      };
      await expect(createCorrection(correction)).rejects.toMatchObject({
        code: "VALIDATION_INVALID_FORMAT",
        hint: expect.any(String),
      });
      await expect(
        findCommittedCorrectionReplay({
          ...correction,
          value: "new",
          idempotency_key: "synthetic_restored_correction",
        })
      ).rejects.toMatchObject({ code: "VALIDATION_INVALID_FORMAT" });
      await expect(
        createCorrection({ ...correction, entity_type: ordinaryType })
      ).rejects.toMatchObject({ code: "VALIDATION_INVALID_FORMAT", hint: expect.any(String) });
      await expect(
        createCorrectionWithVersionPrecondition({
          ...correction,
          expected_version: "synthetic_stale_version",
        })
      ).rejects.toMatchObject({ code: "VALIDATION_INVALID_FORMAT", hint: expect.any(String) });
      for (const [sourceEntityId, canonical_name] of [
        ["ent_restored_exact", "no partial target"],
        ["ent_111111111111111111111111", "synthetic computed collision"],
      ]) {
        const splitFailure = await splitEntity({
          sourceEntityId,
          userId: owner,
          predicate: { observed_at_gte: later },
          newEntity: { entity_type: ordinaryType, canonical_name },
          idempotencyKey: randomUUID(),
          splitBy: "test",
        }).catch((error: unknown) => error);
        // Effects first: early-guard removal exposes an orphan target or moved
        // observations left by the old path before its later native refusal.
        expect(await image(database), "split left partial effects").toEqual(before);
        expect(splitFailure).toMatchObject({ code: "VALIDATION_INVALID_FORMAT" });
      }
      await expect(
        splitEntity({
          sourceEntityId: "ent_foreign_exact",
          userId: owner,
          predicate: { observed_at_gte: later },
          newEntity: { entity_type: ordinaryType, canonical_name: "foreign" },
          idempotencyKey: randomUUID(),
          splitBy: "test",
        })
      ).rejects.toThrow("not found");
      await expect(
        splitEntity({
          sourceEntityId: "ent_absent",
          userId: owner,
          predicate: { observed_at_gte: later },
          newEntity: { entity_type: ordinaryType, canonical_name: "absent" },
          idempotencyKey: randomUUID(),
          splitBy: "test",
        })
      ).rejects.toThrow("not found");
      await expect(
        splitEntity({
          sourceEntityId: "ent_foreign_record",
          userId: owner,
          predicate: { observed_at_gte: later },
          newEntity: { entity_type: ordinaryType, canonical_name: "foreign record" },
          idempotencyKey: randomUUID(),
          splitBy: "test",
        })
      ).rejects.toThrow("not found");
      const args = {
        sourceEntityId: "ent_111111111111111111111111",
        userId: owner,
        predicate: { observed_at_gte: later },
        newEntity: {
          entity_type: ordinaryType,
          canonical_name: "ordinary target",
          target_entity_id: "ent_ordinary_target",
        },
        idempotencyKey: randomUUID(),
        splitBy: "test",
      };
      const ordinary = await splitEntity(args);
      expect(ordinary).toMatchObject({ observations_moved: 1, replayed: false });
      expect(await splitEntity(args)).toMatchObject({
        split_id: ordinary.split_id,
        replayed: true,
      });
    });
  } finally {
    await database.close();
  }
});

it("refuses retained record correction effects on an ordinary physical type", async () => {
  const database = await fixture();
  try {
    await withExistingLifecycleDatabase(database, async () => {
      const server = await startOfflineServer();
      try {
        const before = await image(database);
        const result = await callHttp(server.base, "/correct", {
          entity_id: "ent_restored_record",
          entity_type: ordinaryType,
          field: "title",
          value: "retained record replacement",
          idempotency_key: randomUUID(),
        });
        // This independent effect assertion is the causal regression: native
        // metadata immutability alone used to permit a correction observation
        // and snapshot to be committed on this unsupported ordinary-type row.
        expect(await image(database), "retained record correction mutated storage").toEqual(before);
        expect(result.status).toBe(400);
        expect(result.json).toMatchObject({
          error_code: "VALIDATION_INVALID_FORMAT",
          details: { hint: expect.any(String) },
        });
      } finally {
        await stopServer(server.server);
      }
    });
  } finally {
    await database.close();
  }
});
