/**
 * Bundle schema seeding against the REAL schema registry (shared local SQLite
 * test DB, see vitest.setup.ts): enabling a schema bundle registers its
 * schemas, re-seeding is a no-op, and the bundle that registered each row is
 * recorded in its metadata.
 *
 * Uses the `crm` bundle. Only rows this test itself registered are removed in
 * cleanup, so built-ins seeded by other suites are left alone.
 */

import { afterAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { getBundleSchemas, seedBundleSchemas } from "../../src/services/bundles/index.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

const registeredHere = new Set<string>();

afterAll(async () => {
  for (const type of registeredHere) {
    await db.from("schema_registry").delete().eq("entity_type", type);
  }
});

describe("seedBundleSchemas (real registry)", () => {
  it("registers every crm type, then re-seeds idempotently", async () => {
    const crmTypes = getBundleSchemas("crm").map((s) => s.entity_type);

    const first = await seedBundleSchemas("crm");
    first.registered.forEach((t) => registeredHere.add(t));
    // The seeder collects failures instead of throwing; assert explicitly so a
    // validation refusal cannot pass as a silent no-op.
    expect(first.failed).toEqual([]);
    expect([...first.registered, ...first.preserved].sort()).toEqual([...crmTypes].sort());

    const idsAfterFirst = new Map<string, string>();
    for (const type of crmTypes) {
      const active = await schemaRegistry.loadGlobalSchema(type);
      expect(active, `${type} should have an active global schema`).not.toBeNull();
      idsAfterFirst.set(type, active!.id);
    }

    const second = await seedBundleSchemas("crm");
    expect(second.registered).toEqual([]);
    expect(second.failed).toEqual([]);
    expect([...second.preserved].sort()).toEqual([...crmTypes].sort());

    for (const type of crmTypes) {
      const active = await schemaRegistry.loadGlobalSchema(type);
      expect(active!.id).toBe(idsAfterFirst.get(type));
    }
  });

  it("stamps the originating bundle on rows it registered", async () => {
    // The crm-only types have no built-in, so the first run must register them.
    expect(registeredHere.has("lead_update")).toBe(true);
    for (const type of registeredHere) {
      const active = await schemaRegistry.loadGlobalSchema(type);
      expect(active?.metadata?.bundle).toBe("crm");
      expect(active?.metadata?.bundle_version).toBe("1.0.0");
    }
  });
});
