/**
 * Enabling a schema bundle through the `manage_bundles` MCP handler, observed
 * on the REAL store path (server.store -> storeStructuredInternal) in `guided`
 * mode against the local test DB.
 *
 *   - Before enable, a write of a bundle type is rejected, and the error names
 *     the bundle to enable.
 *   - `manage_bundles install` returns `schema_seed` and registers the
 *     bundle's schemas; the next write uses the bundle's curated field set (no
 *     unknown fields for fields only that schema declares).
 *   - After enable, a write under each bundle alias lands on the curated type.
 *   - Disable does not block writes of types whose schema is already
 *     registered (the documented "Disable, not uninstall" behaviour).
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import {
  getBundleSchemas,
  resetBundleRegistryForTesting,
  resetBundleStateCacheForTesting,
} from "../../src/services/bundles/index.js";
import { getSchemaDefinition } from "../../src/services/schema_definitions.js";
import { runInterpretation } from "../../src/services/interpretation.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { resetSchemaModeCacheForTesting } from "../../src/services/schema_mode.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

type StoreBody = {
  entities?: Array<{ entity_id: string; entity_type: string }>;
  unknown_fields?: string[];
  unknown_fields_count?: number;
  error?: unknown;
};

/** Bundle-originated types (no built-in definition) in the bundles this test enables. */
function bundleOnlyTypes(): string[] {
  return ["crm", "engineering"]
    .flatMap((b) => getBundleSchemas(b))
    .map((s) => s.entity_type)
    .filter((t) => !getSchemaDefinition(t));
}

const ALIASES: Array<[alias: string, canonical: string]> = [
  ["contact_list", "contact_group"],
  ["outreach_activity", "outreach_interaction"],
  ["decision_record", "architectural_decision"],
];

let server: NeotomaServer;
let stateDir: string;

async function cleanup(): Promise<void> {
  for (const type of [...bundleOnlyTypes(), ...ALIASES.map(([a]) => a)]) {
    await cleanupEntityType(type);
  }
}

/** Calls store; returns the parsed body, or `{ error }` with the thrown message. */
async function store(entity: Record<string, unknown>): Promise<StoreBody> {
  try {
    const res = await (
      server as unknown as {
        store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `bundle-enable-${Date.now()}-${Math.random()}`,
      commit: true,
      entities: [entity],
    });
    return JSON.parse(res.content[0].text) as StoreBody;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function manageBundles(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await (
    server as unknown as {
      handleManageBundles(a: unknown): Promise<{ content: Array<{ text: string }> }>;
    }
  ).handleManageBundles(args);
  return JSON.parse(res.content[0].text) as Record<string, unknown>;
}

describe("manage_bundles enable -> guided store (real store path)", () => {
  beforeAll(async () => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-enable-store-"));
    process.env.NEOTOMA_BUNDLE_STATE_PATH = path.join(stateDir, "bundle_state.json");
    process.env.NEOTOMA_SCHEMA_MODE = "guided";
    resetBundleStateCacheForTesting();
    resetBundleRegistryForTesting();
    resetSchemaModeCacheForTesting();
    await cleanup();
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    await cleanup();
    delete process.env.NEOTOMA_BUNDLE_STATE_PATH;
    delete process.env.NEOTOMA_SCHEMA_MODE;
    resetBundleStateCacheForTesting();
    resetBundleRegistryForTesting();
    resetSchemaModeCacheForTesting();
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it("rejects a bundle type before the bundle is enabled, naming the bundle", async () => {
    const body = await store({
      entity_type: "lead_update",
      name: "Intro call",
      what_happened: "First call held.",
    });
    expect(body.entities ?? []).toHaveLength(0);
    expect(String(body.error)).toMatch(/ERR_SCHEMA_MODE_GUIDED_UNPROVIDED/);
    expect(String(body.error)).toMatch(/bundle "crm"/);
    expect(await schemaRegistry.loadGlobalSchema("lead_update")).toBeNull();
  });

  it("rejects a bundle alias before enable, naming the canonical type and bundle", async () => {
    const body = await store({ entity_type: "contact_list", title: "Cohort" });
    expect(body.entities ?? []).toHaveLength(0);
    expect(String(body.error)).toMatch(/ERR_SCHEMA_MODE_GUIDED_UNPROVIDED/);
    expect(String(body.error)).toMatch(/alias of entity type "contact_group"/);
    expect(String(body.error)).toMatch(/bundle "crm"/);
  });

  it("install via manage_bundles seeds schemas and the next write uses the bundle field set", async () => {
    const out = await manageBundles({ action: "install", bundle: "crm" });
    expect(out.ok).toBe(true);
    expect(out.warning).toBeUndefined();
    const seed = out.schema_seed as { ok: boolean; registered: string[]; failed: unknown[] };
    expect(seed.ok).toBe(true);
    expect(seed.failed).toEqual([]);
    expect(seed.registered).toContain("lead_update");

    const registered = await schemaRegistry.loadGlobalSchema("lead_update");
    expect(registered?.metadata?.bundle).toBe("crm");

    // If the bundle's curated schema governs the write, its declared fields are
    // known and a field it does NOT declare is reported unknown. An inferred
    // schema (the failure mode if seeding had not happened) would instead
    // absorb every field of the payload, including `bespoke_score`.
    const body = await store({
      entity_type: "lead_update",
      name: "Intro call",
      what_happened: "First call held.",
      commitments_made: "Send a proposal by Friday.",
      bespoke_score: "7",
    });
    expect(body.error).toBeUndefined();
    expect(body.entities?.[0]?.entity_type).toBe("lead_update");
    expect(body.unknown_fields ?? []).toEqual(["bespoke_score"]);
    const governing = await schemaRegistry.loadActiveSchema("lead_update", TEST_USER_ID);
    expect(governing?.metadata?.bundle).toBe("crm");
  });

  it("after enabling, a write under each bundle alias lands on the curated type", async () => {
    const eng = await manageBundles({ action: "enable", bundle: "engineering" });
    expect((eng.schema_seed as { ok: boolean }).ok).toBe(true);

    for (const [alias, canonical] of ALIASES) {
      const body = await store({ entity_type: alias, title: `via ${alias}` });
      expect(body.error, `${alias} write failed`).toBeUndefined();
      expect(body.entities?.[0]?.entity_type, `${alias} should land on ${canonical}`).toBe(
        canonical
      );
      // No near-duplicate schema was created for the alias name.
      expect(await schemaRegistry.loadActiveSchema(alias, TEST_USER_ID)).toBeNull();
    }
  });

  it("after enabling, extraction-time interpretation maps an alias to the curated type", async () => {
    const { data: source, error } = await db
      .from("sources")
      .insert({
        user_id: TEST_USER_ID,
        original_filename: "bundle_alias_extraction.json",
        mime_type: "application/json",
        file_size: 1,
        content_hash: `bundle_alias_${randomUUID()}`,
      })
      .select("id")
      .single();
    if (error || !source) throw new Error(`source insert failed: ${error?.message}`);
    try {
      const result = await runInterpretation({
        userId: TEST_USER_ID,
        sourceId: source.id,
        extractedData: [{ entity_type: "decision_record", title: "Adopt bundles" }],
        config: {
          provider: "test",
          model_id: "test-model",
          temperature: 0,
          prompt_hash: "bundle_alias_extraction",
          code_version: "1.0.0",
        },
      });
      expect(result.entities.map((e) => e.entityType)).toEqual(["architectural_decision"]);
    } finally {
      await db.from("sources").delete().eq("id", source.id);
    }
  });

  it("disable keeps already-registered types writable (disable is not a write block)", async () => {
    const out = await manageBundles({ action: "disable", bundle: "crm" });
    expect(out.ok).toBe(true);
    expect(String(out.message)).toMatch(/writes of those types still succeed/i);

    const body = await store({ entity_type: "lead_update", name: "Follow-up" });
    expect(body.error).toBeUndefined();
    expect(body.entities?.[0]?.entity_type).toBe("lead_update");
  });

  it("all bundle-only types in the enabled bundles are registered", async () => {
    for (const type of bundleOnlyTypes()) {
      expect(await schemaRegistry.loadGlobalSchema(type), type).not.toBeNull();
    }
  });
});
