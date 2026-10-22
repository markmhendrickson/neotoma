/** These fixtures reserve fresh namespaces; exact public writes remain incomplete. */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { schemaRegistry, SchemaRegistryService } from "../../src/services/schema_registry.js";
import type { AcceptedIdentityBinding } from "../../src/services/entity_identity_contract.js";
import {
  createAcceptedIdentityBinding,
  deriveExactEntityIdentity,
} from "../../src/services/entity_identity_contract.js";
import {
  generateEntityId,
  prepareExactEntityResolution,
  resolveEntityWithTrace,
} from "../../src/services/entity_resolution.js";
import { loadAcceptedIdentityState } from "../../src/services/entity_identity_admission.js";
import { deriveConditionalStoreIdentity } from "../../src/services/store_condition_identity.js";
import { maybeRederiveCanonicalName } from "../../src/services/snapshot_computation.js";
import { createObservation } from "../../src/services/observation_storage.js";
import {
  PARITY_USER_ID,
  callHttp,
  makeMcpServer,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

const suffix = randomUUID().replaceAll("-", "");
const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../../dist/cli/index.js", import.meta.url));
let cliHome: string;

function domainEnvelope(envelope: Record<string, unknown>) {
  const { timestamp: _timestamp, trace_id: _traceId, ...domain } = envelope;
  return domain;
}

/** Use the actual registered tools/call handler, including its public error mapping. */
async function callRegisteredMcp(input: Record<string, unknown>, name = "register_schema") {
  type Handler = (
    request: unknown,
    extra: unknown
  ) => Promise<{ content: Array<{ text: string }> }>;
  const server = makeMcpServer() as unknown as {
    mcpServer: { server: { _requestHandlers: Map<string, Handler> } };
  };
  const handler = server.mcpServer.server._requestHandlers.get("tools/call");
  if (!handler) throw new Error("MCP tools/call is not registered");
  const result = await handler({ method: "tools/call", params: { name, arguments: input } }, {});
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}
const type = (label: string) => `synthetic_exact_${label}_${suffix}`;
const definition = (namespace: string) => ({
  fields: { code: { type: "string" as const }, title: { type: "string" as const } },
  identity_contract: {
    version: "2" as const,
    mode: "exact_utf8" as const,
    namespace,
    canonical_name_fields: ["code"],
  },
});
const config = (entity_type: string) => ({
  entity_type,
  schema_version: "1.0.0",
  schema_definition: definition(`synthetic:${entity_type}:v2`),
  reducer_config: { merge_policies: {} },
  force: true,
  activate: false,
});

function cliRequest(base: string, body: Record<string, unknown>, operation = "registerSchema") {
  return execFileAsync(
    process.execPath,
    [
      cliPath,
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
      cwd: cliHome,
      env: {
        PATH: process.env.PATH,
        HOME: cliHome,
        USERPROFILE: cliHome,
        TMPDIR: cliHome,
        NODE_ENV: "test",
        NEOTOMA_ENV: "development",
        NO_UPDATE_NOTIFIER: "1",
        NEOTOMA_DATA_DIR: join(cliHome, "data"),
        NEOTOMA_SQLITE_PATH: join(cliHome, "data", "state.db"),
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
  );
}

// Suppress only optional detached icon/export work. Registration, transactions,
// both transports, native constraints and persistence remain real.
beforeAll(() => {
  cliHome = mkdtempSync(join(tmpdir(), "identity-admission-cli-"));
  mkdirSync(join(cliHome, "data"));
  vi.spyOn(SchemaRegistryService.prototype as never, "generateIconAsync").mockImplementation(
    () => undefined
  );
  vi.spyOn(SchemaRegistryService.prototype as never, "exportSnapshotsAsync").mockImplementation(
    () => undefined
  );
});
afterAll(() => {
  vi.restoreAllMocks();
  if (cliHome) rmSync(cliHome, { recursive: true, force: true });
});

async function stored(entityType: string) {
  const rows = await db.from("schema_registry").select("*").eq("entity_type", entityType);
  expect(rows.error).toBeNull();
  return rows.data as Array<{
    id: string;
    identity_binding: AcceptedIdentityBinding;
    schema_definition: Record<string, unknown>;
    active: boolean;
  }>;
}

describe("immutable exact-identity admission in the existing registry", () => {
  it("registers and reads back the same exact declaration through real HTTP, registered MCP and compiled generic CLI", async () => {
    const server = await startOfflineServer();
    try {
      const httpType = type("http");
      const http = await callHttp(server.base, "/register_schema", config(httpType));
      expect(http.status).toBe(200);
      const mcpType = type("mcp");
      const mcp = await callRegisteredMcp(config(mcpType));
      expect(mcp.success).toBe(true);
      const cliType = type("cli");
      const cli = JSON.parse((await cliRequest(server.base, config(cliType))).stdout);
      expect(cli.success).toBe(true);
      expect(cli.schema.identity_binding).toMatchObject({
        entity_type: cliType,
        contract: definition(`synthetic:${cliType}:v2`).identity_contract,
      });
      for (const entityType of [httpType, mcpType, cliType]) {
        const rows = await stored(entityType);
        expect(rows).toHaveLength(1);
        expect(rows[0].identity_binding).toMatchObject({
          version: "1",
          anchor_schema_id: rows[0].id,
          entity_type: entityType,
          scope: "global",
          user_id: null,
          contract: definition(`synthetic:${entityType}:v2`).identity_contract,
        });
        expect(rows[0].active).toBe(false);
        expect(rows[0].schema_definition.canonical_name_fields).toEqual(["code"]);
        const binding = rows[0].identity_binding;
        expect(
          deriveExactEntityIdentity(binding, { code: "SR-cli" }, PARITY_USER_ID).entityId
        ).not.toBe(deriveExactEntityIdentity(binding, { code: "sr-cli" }, PARITY_USER_ID).entityId);
      }
    } finally {
      await stopServer(server.server);
    }
  });

  it("prepares original exact strings from the retained registry anchor without granting mutation", async () => {
    const entityType = type("private_preparation");
    const previous = process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
    try {
      process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "true";
      const registered = await schemaRegistry.register(config(entityType));
      process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "false";
      const accepted = await loadAcceptedIdentityState(await getDb(), entityType, PARITY_USER_ID);
      expect(accepted?.binding).toEqual(registered.identity_binding);
      expect(Object.isFrozen(accepted?.binding.contract)).toBe(true);
      const codes = [
        "SR-cli",
        "sr-cli",
        " sr-cli",
        "sr-cli ",
        "sr_cli",
        "sr.cli",
        "é",
        "e\u0301",
        "\u2003SR-cli",
        "SR-cli\u00a0",
      ];
      const identities: string[] = [];
      for (const code of codes) {
        const options = { entityType, userId: PARITY_USER_ID, fields: { code } };
        const prepared = await prepareExactEntityResolution(options);
        expect(prepared?.components).toEqual([["code", code]]);
        const conditional = deriveConditionalStoreIdentity(registered, { code }, PARITY_USER_ID);
        expect(conditional.entityId).toBe(prepared?.entityId);
        identities.push(prepared!.entityId);
      }
      expect(new Set(identities).size).toBe(codes.length);
      await expect(
        maybeRederiveCanonicalName({
          entityId: "ent_unadmitted_target",
          entityType,
          userId: PARITY_USER_ID,
          snapshot: {},
          schema: registered.schema_definition,
        })
      ).rejects.toMatchObject({ code: "VALIDATION_INVALID_FORMAT" });
      const first = await prepareExactEntityResolution({
        entityType,
        userId: PARITY_USER_ID,
        fields: { code: "SR-cli" },
      });
      expect(first?.entityId).toBe(
        deriveExactEntityIdentity(registered.identity_binding!, { code: "SR-cli" }, PARITY_USER_ID)
          .entityId
      );
      await expect(
        prepareExactEntityResolution({
          entityType,
          userId: PARITY_USER_ID,
          fields: { title: "display" },
        })
      ).rejects.toMatchObject({
        code: "VALIDATION_INVALID_FORMAT",
        hint: expect.stringContaining("code"),
      });
      for (const fields of [{ code: "\ud800" }, { code: 42 }])
        await expect(
          prepareExactEntityResolution({ entityType, userId: PARITY_USER_ID, fields })
        ).rejects.toMatchObject({
          code: "VALIDATION_INVALID_FORMAT",
          hint: expect.stringContaining("code"),
        });
      await expect(
        prepareExactEntityResolution({
          entityType,
          userId: PARITY_USER_ID,
          fields: { code: "SR-cli" },
          targetId: "ent_unadmitted_target",
        })
      ).rejects.toThrow(/immutable original components/);
      await expect(
        resolveEntityWithTrace({
          entityType,
          userId: PARITY_USER_ID,
          fields: { code: "SR-cli" },
          commit: true,
        })
      ).rejects.toMatchObject({ code: "VALIDATION_INVALID_FORMAT" });
      expect((await db.from("entities").select("id").eq("entity_type", entityType)).data).toEqual(
        []
      );
    } finally {
      if (previous === undefined) delete process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
      else process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = previous;
    }
  });

  it("refuses missing or changed authority from an unsupported restored registry instead of falling back", async () => {
    const entityType = type("restored_metadata");
    const registered = await schemaRegistry.register(config(entityType));
    // A deliberately unsupported metadata-only restore fixture. No guards are
    // removed and no exact entities are created; this tests reads of bad state.
    const database = new AsyncSqliteDatabase(":memory:");
    try {
      await database.exec(
        "CREATE TABLE schema_registry (id TEXT,entity_type TEXT,schema_version TEXT,schema_definition TEXT,scope TEXT,user_id TEXT,active INTEGER,identity_binding TEXT)"
      );
      const insert = database.prepare("INSERT INTO schema_registry VALUES(?,?,?,?,?,?,?,?)");
      const values = [
        registered.id,
        entityType,
        registered.schema_version,
        JSON.stringify(registered.schema_definition),
        registered.scope,
        registered.user_id,
        0,
        JSON.stringify(registered.identity_binding),
      ];
      await insert.run(...values);
      expect(
        (await loadAcceptedIdentityState(database, entityType, PARITY_USER_ID))?.binding
      ).toEqual(registered.identity_binding);
      for (const update of [
        "UPDATE schema_registry SET id = 'synthetic_missing_anchor'",
        "UPDATE schema_registry SET identity_binding = NULL",
        "UPDATE schema_registry SET identity_binding = json_set(identity_binding,'$.tenant_scoped_entity_ids',json('false'))",
        "UPDATE schema_registry SET identity_binding = json_set(identity_binding,'$.contract_id','invalid')",
        "UPDATE schema_registry SET schema_definition = json_set(schema_definition,'$.identity_contract.version','999')",
      ]) {
        await database.exec("DELETE FROM schema_registry");
        await insert.run(...values);
        // Make the owner-policy mutation deterministic regardless of ambient default.
        const statement =
          update.includes("tenant_scoped_entity_ids") &&
          !registered.identity_binding!.tenant_scoped_entity_ids
            ? update.replace("json('false')", "json('true')")
            : update;
        await database.exec(statement);
        await expect(
          loadAcceptedIdentityState(database, entityType, PARITY_USER_ID)
        ).rejects.toMatchObject({ code: "VALIDATION_INVALID_FORMAT" });
      }
    } finally {
      await database.close();
    }
  });

  it("preserves canonical typed lookup refusal through real HTTP, registered MCP and compiled CLI", async () => {
    const entityType = type("lookup_refusal");
    await schemaRegistry.register(config(entityType));
    const server = await startOfflineServer();
    try {
      const request = { identifier: "SR-cli", entity_type: entityType };
      const http = await callHttp(server.base, "/retrieve_entity_by_identifier", request);
      expect(http.status).toBe(400);
      expect(http.json).toMatchObject({
        error_code: "VALIDATION_INVALID_FORMAT",
        details: { hint: expect.any(String) },
      });
      const error = (await callRegisteredMcp(request, "retrieve_entity_by_identifier").catch(
        (failure: unknown) => failure
      )) as { code: number; data: Record<string, unknown> };
      expect(error.code).toBe(-32602);
      expect(domainEnvelope(error.data)).toEqual(domainEnvelope(http.json));
      const failure = (await cliRequest(server.base, request, "retrieveEntityByIdentifier").catch(
        (error: unknown) => error
      )) as { code: number; stderr: string };
      expect(failure.code).toBe(1);
      const line = failure.stderr.split("\n").find((text) => text.startsWith('{"error":'));
      expect(line).toBeTruthy();
      expect(JSON.parse(line!).hint).toMatchObject({
        code: http.json.error_code,
        hint: (http.json.details as Record<string, unknown>).hint,
      });
      expect((await db.from("entities").select("id").eq("entity_type", entityType)).data).toEqual(
        []
      );
    } finally {
      await stopServer(server.server);
    }
  });

  it.each(["raw_id", "raw_decoy", "direct_name", "snapshot_field"])(
    "refuses returned reserved snapshot metadata on %s without exposing contents or changing storage",
    async (scenario) => {
      const reservedType = type(`candidate_${scenario}`);
      const ordinaryType = type(`ordinary_${scenario}`);
      const registered = await schemaRegistry.register(config(reservedType));
      const database = await getDb();
      const foreignOwner = `synthetic-foreign-${suffix}`;
      const id = () => `ent_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
      const reservedId = id(),
        ordinaryId = id(),
        foreignId = id(),
        emptyId = id(),
        absentId = id();
      const name = `synthetic-candidate-${scenario}-${suffix}`;
      const code = `synthetic-snapshot-code-${scenario}-${suffix}`;
      const privateMarker = `synthetic-unreturned-content-${scenario}-${suffix}`;
      const entities = [
        {
          id: reservedId,
          entity_type: ordinaryType,
          canonical_name: name,
          user_id: PARITY_USER_ID,
        },
        {
          id: ordinaryId,
          entity_type: ordinaryType,
          canonical_name: `ordinary-${name}`,
          user_id: PARITY_USER_ID,
        },
        {
          id: foreignId,
          entity_type: ordinaryType,
          canonical_name: `foreign-${name}`,
          user_id: foreignOwner,
        },
        {
          id: emptyId,
          entity_type: ordinaryType,
          canonical_name: `empty-${name}`,
          user_id: PARITY_USER_ID,
        },
      ];
      expect((await db.from("entities").insert(entities)).error).toBeNull();
      const now = "2026-10-22T00:00:00Z";
      // NEGATIVE fault injection only: an ordinary physical entity carries a
      // reserved snapshot type. No exact entity/observation is inserted, no
      // native guard is removed and no schema is activated.
      const snapshots = [
        {
          entity_id: reservedId,
          entity_type: reservedType,
          user_id: PARITY_USER_ID,
          canonical_name: name,
          snapshot: { code, private_marker: privateMarker },
        },
        // A domain field named entity_type is not authority metadata.
        {
          entity_id: ordinaryId,
          entity_type: ordinaryType,
          user_id: PARITY_USER_ID,
          canonical_name: `ordinary-${name}`,
          snapshot: { code: `ordinary-${code}`, entity_type: reservedType },
        },
        {
          entity_id: foreignId,
          entity_type: reservedType,
          user_id: foreignOwner,
          canonical_name: `foreign-${name}`,
          snapshot: { code: `foreign-${code}`, private_marker: privateMarker },
        },
      ].map((row) => ({
        ...row,
        schema_version: "1",
        observation_count: 0,
        provenance: {},
        computed_at: now,
        last_observation_at: now,
      }));
      expect((await db.from("entity_snapshots").insert(snapshots)).error).toBeNull();
      expect(
        await database
          .prepare("SELECT entity_type,user_id FROM entities WHERE id = ?")
          .get(reservedId)
      ).toEqual({ entity_type: ordinaryType, user_id: PARITY_USER_ID });
      expect(
        await database
          .prepare("SELECT entity_type,user_id FROM entity_snapshots WHERE entity_id = ?")
          .get(reservedId)
      ).toEqual({ entity_type: reservedType, user_id: PARITY_USER_ID });
      expect((await stored(reservedType))[0].active).toBe(false);
      const guardNames = async () =>
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'identity_%' ORDER BY name"
          )
          .all();
      const guards = await guardNames();
      expect(guards).toEqual(
        expect.arrayContaining([
          { name: "identity_reserved_entity_insert_guard" },
          { name: "identity_reserved_observation_insert_guard" },
          { name: "identity_reserved_entity_update_guard" },
          { name: "identity_reserved_observation_update_guard" },
        ])
      );
      async function state() {
        const result: Record<string, unknown> = {};
        for (const table of [
          "schema_registry",
          "entities",
          "entity_snapshots",
          "observations",
          "sources",
          "interpretations",
          "store_condition_keys",
          "timeline_events",
        ])
          result[table] = await database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
        return result;
      }
      const before = await state();
      const server = await startOfflineServer();
      try {
        const request: Record<string, unknown> =
          scenario === "snapshot_field"
            ? { identifier: code, by: "code", include_observations: true }
            : {
                identifier: scenario === "direct_name" ? name : reservedId,
                include_observations: true,
                ...(scenario === "raw_decoy" ? { entity_type: ordinaryType } : {}),
              };
        const http = await callHttp(server.base, "/retrieve_entity_by_identifier", request);
        expect(http.status).toBe(400);
        expect(http.json).toMatchObject({
          error_code: "VALIDATION_INVALID_FORMAT",
          details: { hint: expect.any(String) },
        });
        expect(JSON.stringify(http.json)).not.toContain(privateMarker);
        const error = (await callRegisteredMcp(request, "retrieve_entity_by_identifier").catch(
          (failure: unknown) => failure
        )) as { code: number; data: Record<string, unknown> };
        expect(error.code).toBe(-32602);
        expect(domainEnvelope(error.data)).toEqual(domainEnvelope(http.json));
        expect(JSON.stringify(error.data)).not.toContain(privateMarker);
        const failure = (await cliRequest(server.base, request, "retrieveEntityByIdentifier").catch(
          (error: unknown) => error
        )) as { code: number; stderr: string };
        expect(failure.code).toBe(1);
        const line = failure.stderr.split("\n").find((text) => text.startsWith('{"error":'));
        expect(line).toBeTruthy();
        expect(JSON.parse(line!).hint).toMatchObject({
          code: http.json.error_code,
          hint: (http.json.details as Record<string, unknown>).hint,
        });
        expect(failure.stderr).not.toContain(privateMarker);
        for (const [identifier, expectedIds] of [
          [ordinaryId, [ordinaryId]],
          [emptyId, [emptyId]],
          [foreignId, []],
          [absentId, []],
        ] as Array<[string, string[]]>) {
          const body = { identifier, entity_type: ordinaryType, include_observations: true };
          const httpControl = await callHttp(server.base, "/retrieve_entity_by_identifier", body);
          expect(httpControl.status).toBe(200);
          const mcpControl = await callRegisteredMcp(body, "retrieve_entity_by_identifier");
          const cliControl = JSON.parse(
            (await cliRequest(server.base, body, "retrieveEntityByIdentifier")).stdout
          );
          for (const result of [httpControl.json, mcpControl, cliControl]) {
            expect((result.entities as Array<{ id: string }>).map((row) => row.id)).toEqual(
              expectedIds
            );
            expect(result.total).toBe(expectedIds.length);
            expect(result).not.toHaveProperty("acquiredIdentityTypes");
            expect(JSON.stringify(result)).not.toContain(privateMarker);
          }
        }
        expect(await state()).toEqual(before);
        expect(await guardNames()).toEqual(guards);
        expect((await stored(reservedType))[0].identity_binding).toEqual(
          registered.identity_binding
        );
        expect((await stored(reservedType))[0].active).toBe(false);
      } finally {
        await stopServer(server.server);
      }
    }
  );

  it.each(["replace_type", "delete", "ordinary_replacement"])(
    "refuses previously acquired reserved metadata after deterministic %s interposition",
    async (mutation) => {
      const reservedType = type(`window_${mutation}`);
      const ordinaryType = type(`window_ordinary_${mutation}`);
      await schemaRegistry.register(config(reservedType));
      const entityId = `ent_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
      const name = `synthetic-window-${mutation}-${suffix}`;
      const code = `synthetic-window-code-${mutation}-${suffix}`;
      const marker = `synthetic-acquired-reserved-${mutation}-${suffix}`;
      expect(
        (
          await db.from("entities").insert({
            id: entityId,
            entity_type: ordinaryType,
            canonical_name: name,
            user_id: PARITY_USER_ID,
          })
        ).error
      ).toBeNull();
      const snapshot = {
        entity_id: entityId,
        entity_type: reservedType,
        schema_version: "1",
        canonical_name: name,
        snapshot: { code, marker },
        provenance: {},
        observation_count: 0,
        computed_at: "2026-10-22T00:00:00Z",
        last_observation_at: "2026-10-22T00:00:00Z",
        user_id: PARITY_USER_ID,
      };
      const database = await getDb();
      const server = await startOfflineServer();
      try {
        for (const scenario of ["raw_id", "raw_decoy", "direct_name", "snapshot_field"]) {
          for (const surface of ["http", "mcp", "cli"]) {
            expect((await db.from("entity_snapshots").upsert(snapshot)).error).toBeNull();
            let interpositions = 0;
            const from = db.from.bind(db);
            // Deterministic owned-DB interposition after the physical payload
            // row has been acquired but before its awaiting caller can validate
            // or return it. No timing sleep, guard removal or activation.
            const spy = vi.spyOn(db, "from").mockImplementation((table) => {
              const query = from(table);
              if (table === "entity_snapshots") {
                const execute = query.execute.bind(query);
                query.execute = async () => {
                  const result = await execute();
                  const rows = Array.isArray(result.data) ? result.data : [result.data];
                  if (
                    !interpositions &&
                    rows.some(
                      (row) =>
                        row?.entity_id === entityId &&
                        row.entity_type === reservedType &&
                        row.snapshot != null
                    )
                  ) {
                    interpositions++;
                    if (mutation === "delete")
                      await database
                        .prepare("DELETE FROM entity_snapshots WHERE entity_id = ?")
                        .run(entityId);
                    else if (mutation === "replace_type")
                      await database
                        .prepare("UPDATE entity_snapshots SET entity_type = ? WHERE entity_id = ?")
                        .run(ordinaryType, entityId);
                    else
                      await database
                        .prepare(
                          "UPDATE entity_snapshots SET entity_type = ?, snapshot = ? WHERE entity_id = ?"
                        )
                        .run(ordinaryType, '{"code":"synthetic-ordinary-replacement"}', entityId);
                  }
                  return result;
                };
              }
              return query;
            });
            const request: Record<string, unknown> =
              scenario === "snapshot_field"
                ? { identifier: code, by: "code", include_observations: true }
                : {
                    identifier: scenario === "direct_name" ? name : entityId,
                    include_observations: true,
                    ...(scenario === "raw_decoy" ? { entity_type: ordinaryType } : {}),
                  };
            try {
              if (surface === "http") {
                const result = await callHttp(
                  server.base,
                  "/retrieve_entity_by_identifier",
                  request
                );
                expect(interpositions).toBe(1);
                expect(result.status).toBe(400);
                expect(result.json).toMatchObject({ error_code: "VALIDATION_INVALID_FORMAT" });
                expect(JSON.stringify(result.json)).not.toContain(marker);
              } else if (surface === "mcp") {
                const error = (await callRegisteredMcp(
                  request,
                  "retrieve_entity_by_identifier"
                ).catch((failure: unknown) => failure)) as {
                  code: number;
                  data: Record<string, unknown>;
                };
                expect(interpositions).toBe(1);
                expect(error.code).toBe(-32602);
                expect(error.data).toMatchObject({ error_code: "VALIDATION_INVALID_FORMAT" });
                expect(JSON.stringify(error.data ?? null)).not.toContain(marker);
              } else {
                const failure = (await cliRequest(
                  server.base,
                  request,
                  "retrieveEntityByIdentifier"
                ).catch((error: unknown) => error)) as { code: number; stderr: string };
                expect(interpositions).toBe(1);
                expect(failure.code).toBe(1);
                expect(failure.stderr).toContain("VALIDATION_INVALID_FORMAT");
                expect(failure.stderr).not.toContain(marker);
              }
              const current = (await database
                .prepare("SELECT entity_type,snapshot FROM entity_snapshots WHERE entity_id = ?")
                .get(entityId)) as { entity_type: string; snapshot: string } | undefined;
              if (mutation === "delete") expect(current).toBeUndefined();
              else {
                expect(current?.entity_type).toBe(ordinaryType);
                if (mutation === "ordinary_replacement")
                  expect(current?.snapshot).not.toContain(marker);
              }
            } finally {
              spy.mockRestore();
            }
          }
        }
      } finally {
        await stopServer(server.server);
      }
    }
  );

  it("validates the same physical snapshot used for hydration after an ordinary matching row changes twice", async () => {
    const reservedType = type("hydration_window");
    const ordinaryType = type("hydration_ordinary");
    await schemaRegistry.register(config(reservedType));
    const entityId = `ent_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const code = `synthetic-hydration-code-${suffix}`;
    const marker = `synthetic-hydration-reserved-${suffix}`;
    expect(
      (
        await db.from("entities").insert({
          id: entityId,
          entity_type: ordinaryType,
          canonical_name: `unrelated-hydration-name-${suffix}`,
          user_id: PARITY_USER_ID,
        })
      ).error
    ).toBeNull();
    const snapshot = {
      entity_id: entityId,
      entity_type: ordinaryType,
      schema_version: "1",
      canonical_name: "synthetic-hydration",
      snapshot: { code },
      provenance: {},
      observation_count: 0,
      computed_at: "2026-10-22T00:00:00Z",
      last_observation_at: "2026-10-22T00:00:00Z",
      user_id: PARITY_USER_ID,
    };
    const database = await getDb();
    const server = await startOfflineServer();
    try {
      for (const surface of ["http", "mcp", "cli"]) {
        expect((await db.from("entity_snapshots").upsert(snapshot)).error).toBeNull();
        let interpositions = 0;
        const from = db.from.bind(db);
        const spy = vi.spyOn(db, "from").mockImplementation((table) => {
          const query = from(table);
          if (table === "entity_snapshots") {
            const execute = query.execute.bind(query);
            const select = query.select.bind(query);
            let fullSelection = false;
            query.select = (columns, options) => {
              fullSelection = columns === "*";
              return select(columns, options);
            };
            query.execute = async () => {
              const result = await execute();
              const rows = Array.isArray(result.data) ? result.data : [result.data];
              if (rows.some((row) => row?.entity_id === entityId && row.snapshot != null)) {
                if (interpositions === 0 && rows.some((row) => row?.entity_type === ordinaryType)) {
                  interpositions++;
                  await database
                    .prepare(
                      "UPDATE entity_snapshots SET entity_type = ?, snapshot = ? WHERE entity_id = ?"
                    )
                    .run(reservedType, JSON.stringify({ code, marker }), entityId);
                } else if (
                  interpositions === 1 &&
                  fullSelection &&
                  rows.some((row) => row?.entity_type === reservedType)
                ) {
                  interpositions++;
                  await database
                    .prepare(
                      "UPDATE entity_snapshots SET entity_type = ?, snapshot = ? WHERE entity_id = ?"
                    )
                    .run(ordinaryType, JSON.stringify({ code }), entityId);
                }
              }
              return result;
            };
          }
          return query;
        });
        try {
          const request = { identifier: code, by: "code", include_observations: true };
          if (surface === "http") {
            const result = await callHttp(server.base, "/retrieve_entity_by_identifier", request);
            expect(interpositions).toBe(2);
            expect(result.status).toBe(400);
            expect(result.json).toMatchObject({ error_code: "VALIDATION_INVALID_FORMAT" });
            expect(JSON.stringify(result.json)).not.toContain(marker);
          } else if (surface === "mcp") {
            const error = (await callRegisteredMcp(request, "retrieve_entity_by_identifier").catch(
              (failure: unknown) => failure
            )) as { code: number; data: Record<string, unknown> };
            expect(interpositions).toBe(2);
            expect(error.code).toBe(-32602);
            expect(error.data).toMatchObject({ error_code: "VALIDATION_INVALID_FORMAT" });
            expect(JSON.stringify(error.data ?? null)).not.toContain(marker);
          } else {
            const failure = (await cliRequest(
              server.base,
              request,
              "retrieveEntityByIdentifier"
            ).catch((error: unknown) => error)) as { code: number; stderr: string };
            expect(interpositions).toBe(2);
            expect(failure.code).toBe(1);
            expect(failure.stderr).toContain("VALIDATION_INVALID_FORMAT");
            expect(failure.stderr).not.toContain(marker);
          }
          const current = (await database
            .prepare("SELECT entity_type,snapshot FROM entity_snapshots WHERE entity_id = ?")
            .get(entityId)) as { entity_type: string; snapshot: string };
          expect(current.entity_type).toBe(ordinaryType);
          expect(current.snapshot).not.toContain(marker);
        } finally {
          spy.mockRestore();
        }
      }
    } finally {
      await stopServer(server.server);
    }
  });

  it("refuses malformed or failed physical snapshot acquisition instead of returning unverified content", async () => {
    const ordinaryType = type("unavailable_authority");
    const entityId = `ent_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const name = `synthetic-authority-${suffix}`;
    const marker = `synthetic-unverified-authority-${suffix}`;
    expect(
      (
        await db
          .from("entities")
          .insert({
            id: entityId,
            entity_type: ordinaryType,
            canonical_name: name,
            user_id: PARITY_USER_ID,
          })
      ).error
    ).toBeNull();
    expect(
      (
        await db
          .from("entity_snapshots")
          .insert({
            entity_id: entityId,
            entity_type: ordinaryType,
            schema_version: "1",
            canonical_name: name,
            snapshot: { marker },
            provenance: {},
            observation_count: 0,
            user_id: PARITY_USER_ID,
          })
      ).error
    ).toBeNull();
    const server = await startOfflineServer();
    try {
      for (const fault of ["missing_type", "read_error"]) {
        for (const identifier of [entityId, name]) {
          for (const surface of ["http", "mcp", "cli"]) {
            let interpositions = 0;
            const from = db.from.bind(db);
            const spy = vi.spyOn(db, "from").mockImplementation((table) => {
              const query = from(table);
              if (table === "entity_snapshots") {
                const execute = query.execute.bind(query);
                query.execute = async () => {
                  const result = await execute();
                  const rows = Array.isArray(result.data) ? result.data : [result.data];
                  if (
                    !interpositions &&
                    rows.some((row) => row?.entity_id === entityId && row.snapshot != null)
                  ) {
                    interpositions++;
                    if (fault === "read_error")
                      return {
                        data: null,
                        error: {
                          message: "Synthetic required snapshot read failure",
                          code: "DB_QUERY_FAILED",
                        },
                      };
                    for (const row of rows) if (row?.entity_id === entityId) delete row.entity_type;
                  }
                  return result;
                };
              }
              return query;
            });
            try {
              const request = { identifier, include_observations: true };
              if (surface === "http") {
                const result = await callHttp(
                  server.base,
                  "/retrieve_entity_by_identifier",
                  request
                );
                expect(interpositions).toBe(1);
                expect(result.status).toBe(fault === "missing_type" ? 400 : 500);
                expect(JSON.stringify(result.json)).not.toContain(marker);
              } else if (surface === "mcp") {
                const error = (await callRegisteredMcp(
                  request,
                  "retrieve_entity_by_identifier"
                ).catch((failure: unknown) => failure)) as { code: number; data?: unknown };
                expect(interpositions).toBe(1);
                expect(error.code).toBe(fault === "missing_type" ? -32602 : -32603);
                expect(JSON.stringify(error.data ?? null)).not.toContain(marker);
              } else {
                const failure = (await cliRequest(
                  server.base,
                  request,
                  "retrieveEntityByIdentifier"
                ).catch((error: unknown) => error)) as { code: number; stderr: string };
                expect(interpositions).toBe(1);
                expect(failure.code).toBe(1);
                expect(failure.stderr).not.toContain(marker);
              }
            } finally {
              spy.mockRestore();
            }
          }
        }
      }
    } finally {
      await stopServer(server.server);
    }
  });

  it("blocks native reclassification into a reserved identity namespace before changing either row", async () => {
    const entityType = type("reclassification");
    await schemaRegistry.register(config(entityType));
    const database = await getDb();
    const legacyType = type("reclassification_control");
    const entityId = generateEntityId(legacyType, "control");
    const inserted = await db.from("entities").insert({
      id: entityId,
      entity_type: legacyType,
      canonical_name: "control",
      user_id: PARITY_USER_ID,
    });
    expect(inserted.error).toBeNull();
    const observation = await createObservation({
      entity_id: entityId,
      entity_type: legacyType,
      schema_version: "1",
      source_id: null,
      interpretation_id: null,
      user_id: PARITY_USER_ID,
      observed_at: "2026-10-20T00:00:00Z",
      fields: { code: "control" },
      specificity_score: 1,
      source_priority: 100,
      idempotency_key: `reclassify-${suffix}`,
    });
    for (const [table, id] of [
      ["entities", entityId],
      ["observations", observation.id],
    ]) {
      const before = await database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      expect(before).toBeTruthy();
      await expect(
        database.prepare(`UPDATE ${table} SET entity_type = ? WHERE id = ?`).run(entityType, id)
      ).rejects.toThrow(/EXACT_IDENTITY_ACTIVATION_UNAVAILABLE/);
      expect(await database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)).toEqual(before);
    }
  });

  it("keeps activation and reserved writes closed in supported APIs and native storage without adding rows", async () => {
    const entityType = type("reserved");
    const first = await schemaRegistry.register(config(entityType));
    const database = await getDb();
    // Positive control for the same physical observation-count instrument.
    const control = await createObservation({
      entity_id: `ent_identity_control_${suffix}`,
      entity_type: type("control"),
      schema_version: "1",
      source_id: null,
      interpretation_id: null,
      user_id: PARITY_USER_ID,
      observed_at: "2026-10-20T00:00:00Z",
      fields: { code: "legacy" },
      specificity_score: 1,
      source_priority: 100,
      idempotency_key: `identity-control-${suffix}`,
    });
    expect(
      await database.prepare("SELECT id FROM observations WHERE id = ?").get(control.id)
    ).toEqual({ id: control.id });
    async function counts() {
      const result: Record<string, unknown> = {};
      for (const table of [
        "schema_registry",
        "entities",
        "observations",
        "sources",
        "store_condition_keys",
      ])
        result[table] = await database.prepare(`SELECT count(*) AS n FROM ${table}`).get();
      return result;
    }
    const before = await counts();
    await expect(schemaRegistry.activate(entityType, first.schema_version)).rejects.toThrow(
      /EXACT_IDENTITY_ACTIVATION_UNAVAILABLE/
    );
    await expect(
      database.prepare("UPDATE schema_registry SET active = 1 WHERE id = ?").run(first.id)
    ).rejects.toThrow(/EXACT_IDENTITY_ACTIVATION_UNAVAILABLE/);
    const copied = { ...first, id: randomUUID(), schema_version: "1.0.1", active: true };
    const insertion = await db.from("schema_registry").insert(copied);
    expect(insertion.error?.message).toContain("EXACT_IDENTITY_ACTIVATION_UNAVAILABLE");
    await expect(
      database
        .prepare("INSERT INTO entities(id,entity_type,canonical_name,user_id) VALUES(?,?,?,?)")
        .run(`ent_reserved_${suffix}`, entityType, "SR-cli", PARITY_USER_ID)
    ).rejects.toThrow(/EXACT_IDENTITY_ACTIVATION_UNAVAILABLE/);
    await expect(
      database
        .prepare(
          "INSERT INTO observations(id,entity_id,entity_type,schema_version,observed_at,fields,user_id) VALUES(?,?,?,?,?,?,?)"
        )
        .run(
          randomUUID(),
          `ent_reserved_${suffix}`,
          entityType,
          "1",
          "2026-10-20T00:00:00Z",
          '{"code":"SR-cli"}',
          PARITY_USER_ID
        )
    ).rejects.toThrow(/EXACT_IDENTITY_ACTIVATION_UNAVAILABLE/);
    const server = await startOfflineServer();
    try {
      const payload = { ...config(entityType), schema_version: "1.1.0", activate: true };
      const http = await callHttp(server.base, "/register_schema", payload);
      expect(http.status).toBe(400);
      await expect(callRegisteredMcp(payload)).rejects.toMatchObject({
        code: -32602,
        data: {
          error_code: http.json.error_code,
          message: http.json.message,
          details: http.json.details,
        },
      });
      const cli = (await cliRequest(server.base, payload).then(
        () => {
          throw new Error("Expected CLI activation refusal");
        },
        (error: unknown) => error
      )) as { code: number; stderr: string };
      expect(cli.code).toBe(1);
      expect(cli.stderr).toContain("VALIDATION_INVALID_FORMAT");
      const store = {
        entities: [{ entity_type: entityType, code: "SR-cli" }],
        idempotency_key: `reserved-store-${suffix}`,
        commit: true,
      };
      const refusedStore = await callHttp(server.base, "/store", store);
      expect(refusedStore.status).toBe(400);
      await expect(callRegisteredMcp(store, "store")).rejects.toMatchObject({
        code: -32602,
        data: {
          error_code: refusedStore.json.error_code,
          message: refusedStore.json.message,
          details: refusedStore.json.details,
        },
      });
      await expect(
        createObservation({
          ...control,
          idempotency_key: `reserved-direct-${suffix}`,
          entity_id: `ent_reserved_${suffix}`,
          entity_type: entityType,
          fields: { code: "SR-cli" },
        })
      ).rejects.toMatchObject({ code: "VALIDATION_INVALID_FORMAT" });
      const conditional = {
        ...store,
        expected_entity_absent: true,
        idempotency_key: `reserved-conditional-${suffix}`,
      };
      const refusedConditional = await callHttp(server.base, "/store", conditional);
      expect(refusedConditional.status).toBe(400);
      await expect(callRegisteredMcp(conditional, "store")).rejects.toMatchObject({
        code: -32602,
        data: {
          error_code: refusedConditional.json.error_code,
          message: refusedConditional.json.message,
          details: refusedConditional.json.details,
        },
      });
      expect(await counts()).toEqual(before);
      expect((await stored(entityType))[0].active).toBe(false);
    } finally {
      await stopServer(server.server);
    }
  });

  it("captures the owner policy once, retains it across versions and allows nonidentity evolution", async () => {
    const entityType = type("policy");
    const previous = process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
    try {
      process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "true";
      const first = await schemaRegistry.register(config(entityType));
      expect(first.identity_binding?.tenant_scoped_entity_ids).toBe(true);
      process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "false";
      const second = await schemaRegistry.register({
        ...config(entityType),
        schema_version: "1.1.0",
        schema_definition: {
          ...config(entityType).schema_definition,
          fields: { ...config(entityType).schema_definition.fields, status: { type: "string" } },
        },
      });
      expect(second.identity_binding).toEqual(first.identity_binding);
      expect(second.id).not.toBe(first.id);
      expect(await stored(entityType)).toHaveLength(2);
    } finally {
      if (previous === undefined) delete process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
      else process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = previous;
    }
  });

  it("uses the same canonical refusal envelope for malformed Unicode, mismatched rules and heuristic opt-out over HTTP and registered MCP", async () => {
    const server = await startOfflineServer();
    try {
      for (const scenario of ["unicode", "rules", "opt_out"]) {
        const entityType = type(`${scenario}_refusal`);
        const payload = {
          ...config(entityType),
          schema_definition: {
            ...definition(scenario === "unicode" ? "\ud800" : `synthetic:${entityType}:v2`),
            ...(scenario === "rules" ? { canonical_name_fields: ["title"] } : {}),
            ...(scenario === "opt_out" ? { identity_opt_out: "heuristic_canonical_name" } : {}),
          },
        };
        const http = await callHttp(server.base, "/register_schema", payload);
        expect(http.status).toBe(400);
        expect(http.json).toMatchObject({
          error_code: "VALIDATION_INVALID_FORMAT",
          message: expect.any(String),
          details: { hint: expect.stringContaining("fresh schema namespace") },
          timestamp: expect.any(String),
        });
        const error = (await callRegisteredMcp(payload).then(
          () => {
            throw new Error("Expected MCP refusal");
          },
          (failure: unknown) => failure
        )) as { code: number; data: Record<string, unknown> };
        expect(error.code).toBe(-32602);
        // Compare every domain field; timestamps and trace IDs belong to the transports.
        expect(domainEnvelope(error.data)).toEqual(domainEnvelope(http.json));
        for (const envelope of [http.json, error.data])
          if (envelope.timestamp !== undefined)
            expect(new Date(envelope.timestamp as string).toISOString()).toBe(envelope.timestamp);
        expect(await stored(entityType)).toHaveLength(0);
      }
    } finally {
      await stopServer(server.server);
    }
  });

  it("reserves a namespace only once and refuses an unrelated type's attempt to claim it", async () => {
    const firstType = type("namespace_first");
    const first = await schemaRegistry.register(config(firstType));
    const secondType = type("namespace_second");
    await expect(
      schemaRegistry.register({
        ...config(secondType),
        schema_definition: config(firstType).schema_definition,
      })
    ).rejects.toThrow(/unused namespace/);
    expect(await stored(secondType)).toHaveLength(0);
    expect((await stored(firstType))[0].identity_binding).toEqual(first.identity_binding);
  });

  it("preserves the canonical identity code and repair hint through compiled CLI registration requests", async () => {
    const server = await startOfflineServer();
    try {
      const entityType = type("cli_refusal");
      const payload = {
        ...config(entityType),
        schema_definition: {
          ...definition(`synthetic:${entityType}:v2`),
          canonical_name_fields: ["title"],
        },
      };
      const http = await callHttp(server.base, "/register_schema", payload);
      expect(http.status).toBe(400);
      const failure = (await cliRequest(server.base, payload).then(
        () => {
          throw new Error("Expected compiled CLI refusal");
        },
        (error: unknown) => error
      )) as { code: number; stderr: string };
      expect(failure.code).toBe(1);
      const line = failure.stderr.split("\n").find((text) => text.startsWith('{"error":'));
      expect(line).toBeTruthy();
      const emitted = JSON.parse(line!);
      expect(emitted.hint).toMatchObject({
        code: http.json.error_code,
        hint: (http.json.details as Record<string, unknown>).hint,
      });
      expect(await stored(entityType)).toHaveLength(0);
    } finally {
      await stopServer(server.server);
    }
  });

  it("refuses namespace/rule/scope changes and downgrade without creating a new version", async () => {
    const entityType = type("immutable");
    const first = await schemaRegistry.register(config(entityType));
    for (const altered of [
      { ...config(entityType), schema_definition: definition("synthetic:changed:v2") },
      {
        ...config(entityType),
        schema_definition: {
          ...config(entityType).schema_definition,
          identity_contract: {
            ...config(entityType).schema_definition.identity_contract,
            canonical_name_fields: ["title"],
          },
        },
      },
      { ...config(entityType), user_specific: true, user_id: PARITY_USER_ID },
      {
        ...config(entityType),
        schema_definition: { fields: definition("unused").fields, canonical_name_fields: ["code"] },
      },
    ])
      await expect(
        schemaRegistry.register({ ...altered, schema_version: "2.0.0" })
      ).rejects.toThrow();
    expect(await stored(entityType)).toHaveLength(1);
    expect((await stored(entityType))[0].identity_binding).toEqual(first.identity_binding);
  });

  it("requires a physically fresh identity space, even when prior rows have no snapshots", async () => {
    const entityType = type("occupied");
    const id = generateEntityId(entityType, "legacy");
    const inserted = await db
      .from("entities")
      .insert({ id, entity_type: entityType, canonical_name: "legacy", user_id: PARITY_USER_ID });
    expect(inserted.error).toBeNull();
    await expect(schemaRegistry.register(config(entityType))).rejects.toThrow(
      /fresh schema namespace/
    );
    expect(await stored(entityType)).toEqual([]);
    const database = await getDb();
    const rawId = randomUUID();
    const rawDefinition = {
      ...definition(`synthetic:${entityType}:v2`),
      canonical_name_fields: ["code"],
    };
    const binding = createAcceptedIdentityBinding({
      anchorSchemaId: rawId,
      entityType,
      scope: "global",
      userId: null,
      tenantScopedEntityIds: false,
      contract: rawDefinition.identity_contract,
    });
    // Bypass the service precheck deliberately: native admission must also bind.
    await expect(
      database
        .prepare(
          "INSERT INTO schema_registry(id,entity_type,schema_version,schema_definition,reducer_config,active,scope,identity_binding) VALUES(?,?,?,?,?,0,'global',?)"
        )
        .run(
          rawId,
          entityType,
          "2.0.0",
          JSON.stringify(rawDefinition),
          '{"merge_policies":{}}',
          JSON.stringify(binding)
        )
    ).rejects.toThrow(/EXACT_IDENTITY_FRESH_NAMESPACE_REQUIRED/);
    expect(await stored(entityType)).toEqual([]);
    await db.from("entities").delete().eq("id", id);
    const legacyType = type("legacy_schema");
    await schemaRegistry.register({
      ...config(legacyType),
      schema_definition: {
        fields: definition("unused").fields,
        canonical_name_fields: ["code"],
      },
    });
    await expect(
      schemaRegistry.register({ ...config(legacyType), schema_version: "2.0.0" })
    ).rejects.toThrow(/fresh schema namespace/);
  });

  it("native OLD-row guards reject replacement/removal and preserve ordinary metadata updates", async () => {
    const entityType = type("native");
    const registered = await schemaRegistry.register(config(entityType));
    const database = await getDb();
    const before = await database
      .prepare("SELECT * FROM schema_registry WHERE id = ?")
      .get(registered.id);
    expect(before).toBeTruthy();
    for (const statement of [
      "UPDATE schema_registry SET identity_binding = NULL WHERE id = ?",
      "UPDATE schema_registry SET entity_type = 'synthetic_reclassified' WHERE id = ?",
      "UPDATE schema_registry SET user_id = 'synthetic-foreign-owner' WHERE id = ?",
      'UPDATE schema_registry SET schema_definition = \'{"fields":{},"identity_opt_out":"heuristic_canonical_name"}\' WHERE id = ?',
      "DELETE FROM schema_registry WHERE id = ?",
    ])
      await expect(database.prepare(statement).run(registered.id)).rejects.toThrow(
        /EXACT_IDENTITY_BINDING_IMMUTABLE/
      );
    expect(
      await database.prepare("SELECT * FROM schema_registry WHERE id = ?").get(registered.id)
    ).toEqual(before);
    await database
      .prepare("UPDATE schema_registry SET metadata = '{\"synthetic\":true}' WHERE id = ?")
      .run(registered.id);
    expect((await stored(entityType))[0].identity_binding).toEqual(registered.identity_binding);
  });

  it("upgrades an owned old registry without changing legacy declaration bytes or IDs", async () => {
    const database = new AsyncSqliteDatabase(":memory:");
    try {
      await database.exec(
        "CREATE TABLE schema_registry (id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,schema_version TEXT NOT NULL,schema_definition TEXT NOT NULL,reducer_config TEXT NOT NULL,active INTEGER,created_at TEXT,user_id TEXT,scope TEXT,metadata TEXT)"
      );
      const declaration = '{"fields":{"code":{"type":"string"}},"canonical_name_fields":["code"]}';
      await database
        .prepare(
          "INSERT INTO schema_registry(id,entity_type,schema_version,schema_definition,reducer_config,scope) VALUES(?,?,?,?,?,?)"
        )
        .run(
          "synthetic-legacy-schema",
          "synthetic_legacy_item",
          "1",
          declaration,
          '{"merge_policies":{}}',
          "global"
        );
      await ensureSchema(database);
      await ensureSchema(database);
      expect(
        await database
          .prepare("SELECT id,schema_definition,identity_binding FROM schema_registry")
          .get()
      ).toEqual({
        id: "synthetic-legacy-schema",
        schema_definition: declaration,
        identity_binding: null,
      });
      expect(generateEntityId("note", "SR-cli")).toBe(generateEntityId("note", "sr-cli"));
    } finally {
      await database.close();
    }
  });
});
