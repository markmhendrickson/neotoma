/** These fixtures reserve fresh namespaces; exact public writes remain incomplete. */
import { randomUUID } from "node:crypto";
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
import { generateEntityId } from "../../src/services/entity_resolution.js";
import {
  PARITY_USER_ID,
  callHttp,
  callMcp,
  makeMcpServer,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

const suffix = randomUUID().replaceAll("-", "");
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

// Suppress only optional detached icon/export work. Registration, transactions,
// both transports, native constraints and persistence remain real.
beforeAll(() => {
  vi.spyOn(SchemaRegistryService.prototype as never, "generateIconAsync").mockImplementation(
    () => undefined
  );
  vi.spyOn(SchemaRegistryService.prototype as never, "exportSnapshotsAsync").mockImplementation(
    () => undefined
  );
});
afterAll(() => vi.restoreAllMocks());

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
  it("registers and reads back the same exact declaration through real HTTP and MCP", async () => {
    const server = await startOfflineServer();
    try {
      const httpType = type("http");
      const http = await callHttp(server.base, "/register_schema", config(httpType));
      expect(http.status).toBe(200);
      const mcpType = type("mcp");
      const mcp = await callMcp(makeMcpServer(), "register_schema", config(mcpType));
      expect(mcp.success).toBe(true);
      for (const entityType of [httpType, mcpType]) {
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

  it("refuses malformed public declarations with a canonical validation code and repair hint", async () => {
    const server = await startOfflineServer();
    try {
      const entityType = type("unicode_refusal");
      const payload = { ...config(entityType), schema_definition: definition("\ud800") };
      const http = await callHttp(server.base, "/register_schema", payload);
      expect(http.status).toBe(400);
      expect(http.json).toMatchObject({
        error_code: "VALIDATION_INVALID_FORMAT",
        details: { hint: expect.stringContaining("fresh schema namespace") },
      });
      await expect(callMcp(makeMcpServer(), "register_schema", payload)).rejects.toMatchObject({
        code: -32602,
        data: {
          code: "VALIDATION_INVALID_FORMAT",
          hint: expect.stringContaining("fresh schema namespace"),
        },
      });
      expect(await stored(entityType)).toHaveLength(0);
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
    ).rejects.toThrow(/UNIQUE constraint failed/);
    expect(await stored(secondType)).toHaveLength(0);
    expect((await stored(firstType))[0].identity_binding).toEqual(first.identity_binding);
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
