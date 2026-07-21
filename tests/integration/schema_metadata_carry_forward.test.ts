/**
 * Effect-level regression test for #1977: an incremental schema update must
 * not drop `guest_access_policy`, and the fix must hold across every surface
 * that can reactivate a schema version (updateSchemaIncremental AND
 * register_schema / register()).
 *
 * Unlike tests/services/schema_registry_incremental.test.ts (which mocks the
 * DB and asserts on the insert payload), this test drives a real HTTP server
 * and a real SQLite-backed SchemaRegistryService, and asserts on the actual
 * production symptom: a guest-token read of a rendered_page entity returning
 * 200, not 500.
 */

import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { generateGuestAccessToken, hashGuestAccessToken } from "../../src/services/guest_access_token.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const ENTITY_TYPE = "rendered_page";
const tracker = new TestIdTracker();

async function withRealServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const { app } = await import("../../src/actions.js");
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function guestTokenFor(userId: string): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds: [], userId });
  tracker.trackEntity(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

async function insertRenderedPageEntity(userId: string): Promise<string> {
  const entityId = `ent_test_rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  tracker.trackEntity(entityId);
  await db.from("entities").insert({
    id: entityId,
    user_id: userId,
    entity_type: ENTITY_TYPE,
    canonical_name: `rendered_page:${entityId}`,
  });
  await db.from("entity_snapshots").upsert({
    entity_id: entityId,
    user_id: userId,
    entity_type: ENTITY_TYPE,
    schema_version: "1.0",
    canonical_name: `rendered_page:${entityId}`,
    snapshot: { title: "Test page", html_body: "<p>hello</p>" },
  });
  return entityId;
}

describe("Schema metadata carry-forward — effect + cross-surface (#1977)", () => {
  const registryService = new SchemaRegistryService();
  let server: NeotomaServer;

  beforeEach(async () => {
    server = new NeotomaServer();
    await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
  });

  afterEach(async () => {
    await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
    await tracker.cleanup();
  });

  it("guest-token HTTP read returns 200 (not 500) after update_schema_incremental adds a field (surface: HTTP route + updateSchemaIncremental)", async () => {
    const userId = `user-1977-http-${Date.now()}`;

    await registryService.register({
      entity_type: ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: { html_body: { type: "string" }, title: { type: "string" } },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          html_body: { strategy: "last_write" },
          title: { strategy: "last_write" },
        },
      },
      activate: true,
      metadata: { label: "Rendered page", guest_access_policy: "read_only" },
    });

    // The bug: updateSchemaIncremental used to register the new version
    // without metadata, dropping guest_access_policy and resetting the type
    // to "closed" — every guest read 500'd afterward.
    await registryService.updateSchemaIncremental({
      entity_type: ENTITY_TYPE,
      fields_to_add: [{ field_name: "markdown_source", field_type: "string" }],
      activate: true,
    });

    const entityId = await insertRenderedPageEntity(userId);
    const token = await guestTokenFor(userId);

    await withRealServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/entities/${entityId}/html?access_token=${token}`);
      expect(response.status).toBe(200);
    });
  });

  it("register_schema reactivating an existing active version with no explicit metadata preserves guest_access_policy (surface: MCP tool handler + register())", async () => {
    const userId = `user-1977-mcp-${Date.now()}`;

    const baseSchema = await registryService.register({
      entity_type: ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: { html_body: { type: "string" } },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: { merge_policies: { html_body: { strategy: "last_write" } } },
      activate: true,
      metadata: { label: "Rendered page", guest_access_policy: "read_only" },
    });
    expect(baseSchema.metadata?.guest_access_policy).toBe("read_only");

    // Drive through the actual MCP tool dispatch surface (register_schema via
    // executeToolForCli, the same entry point CLI/MCP callers use), and — per
    // the finding — omit metadata entirely, the exact shape that dropped
    // guest_access_policy via this surface.
    const mcpResponse = await server.executeToolForCli(
      "register_schema",
      {
        entity_type: ENTITY_TYPE,
        schema_version: "1.1",
        schema_definition: {
          fields: { html_body: { type: "string" }, extra_field: { type: "string" } },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: {
          merge_policies: {
            html_body: { strategy: "last_write" },
            extra_field: { strategy: "last_write" },
          },
        },
        activate: true,
        user_specific: false,
      },
      userId
    );
    const parsed = JSON.parse(mcpResponse.content[0].text);
    expect(parsed.success).toBe(true);

    const activeSchema = await registryService.loadActiveSchema(ENTITY_TYPE);
    expect(activeSchema?.metadata?.guest_access_policy).toBe("read_only");

    // Confirm at the effect level too: a guest read must still succeed.
    const entityId = await insertRenderedPageEntity(userId);
    const token = await guestTokenFor(userId);
    await withRealServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/entities/${entityId}/html?access_token=${token}`);
      expect(response.status).toBe(200);
    });
  });
});
