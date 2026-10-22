/**
 * Regression: updateSchemaIncremental must carry row-level `metadata` forward.
 *
 * `guest_access_policy` resolves from SchemaMetadata on the ACTIVE schema row.
 * updateSchemaIncremental registers a NEW version and activates it; it used to
 * omit `metadata` from that register() call, so the new active row carried `{}`
 * and the entity type silently fell back to the `closed` default — breaking
 * every token-gated guest read of that type (#1977, and the umbrella #2061).
 *
 * The bug is invisible at write time: no error, no warning. These tests pin the
 * carry-forward so an additive field change can never again revoke guest access.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { SchemaRegistryEntry } from "../../src/services/schema_registry.js";

const registerCalls: Array<Record<string, unknown>> = [];

vi.mock("../../src/db.js", () => ({
  db: {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        is: vi.fn(() => builder),
        update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
        get data() {
          return [];
        },
        get error() {
          return null;
        },
      };
      return builder;
    }),
  },
}));

const CURRENT: SchemaRegistryEntry = {
  id: "schema-global-rendered_page",
  entity_type: "rendered_page",
  schema_version: "1.0.0",
  schema_definition: {
    fields: {
      title: { type: "string", required: false },
      html_body: { type: "string", required: false },
    },
  },
  reducer_config: { merge_policies: {} },
  active: true,
  created_at: new Date(0).toISOString(),
  user_id: null,
  scope: "global",
  metadata: { guest_access_policy: "read_only", icon: "page" },
} as unknown as SchemaRegistryEntry;

/**
 * Minimal harness: exercise updateSchemaIncremental's carry-forward by stubbing
 * the two collaborators it uses — loadActiveSchema (input) and register
 * (output) — and asserting on what it hands to register().
 */
async function runIncrementalUpdate(
  options: Record<string, unknown>,
  current: SchemaRegistryEntry = CURRENT
) {
  const { SchemaRegistryService } = await import("../../src/services/schema_registry.js");
  const registry = new SchemaRegistryService();

  vi.spyOn(
    registry as unknown as { loadActiveSchema: () => Promise<SchemaRegistryEntry> },
    "loadActiveSchema"
  ).mockResolvedValue(current);

  vi.spyOn(
    registry as unknown as {
      register: (c: Record<string, unknown>) => Promise<SchemaRegistryEntry>;
    },
    "register"
  ).mockImplementation(async (config: Record<string, unknown>) => {
    registerCalls.push(config);
    return { ...current, ...config } as SchemaRegistryEntry;
  });

  vi.spyOn(registry as unknown as { activate: () => Promise<void> }, "activate").mockResolvedValue(
    undefined
  );

  await registry.updateSchemaIncremental({
    entity_type: "rendered_page",
    ...options,
  } as Parameters<typeof registry.updateSchemaIncremental>[0]);

  return registerCalls[registerCalls.length - 1];
}

describe("updateSchemaIncremental — metadata preservation (#2061 / #1977)", () => {
  beforeEach(() => {
    registerCalls.length = 0;
    vi.restoreAllMocks();
  });

  it("carries guest_access_policy forward when adding an unrelated field", async () => {
    const config = await runIncrementalUpdate({
      fields_to_add: [{ field_name: "meta_description", field_type: "string" }],
    });

    const metadata = config.metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    // The actual #1977 outage: this was `{}`, so the type fell back to "closed".
    expect(metadata.guest_access_policy).toBe("read_only");
  });

  it("preserves unrelated metadata keys (icon) too", async () => {
    const config = await runIncrementalUpdate({
      fields_to_add: [{ field_name: "meta_description", field_type: "string" }],
    });

    expect((config.metadata as Record<string, unknown>).icon).toBe("page");
  });

  it("lets an explicit metadata option override a single key without dropping others", async () => {
    const config = await runIncrementalUpdate({
      fields_to_add: [{ field_name: "meta_description", field_type: "string" }],
      metadata: { guest_access_policy: "closed" },
    });

    const metadata = config.metadata as Record<string, unknown>;
    expect(metadata.guest_access_policy).toBe("closed");
    // Overriding one key must not wipe the rest.
    expect(metadata.icon).toBe("page");
  });

  it("yields an empty object rather than undefined when the prior row had no metadata", async () => {
    const bare = { ...CURRENT, metadata: undefined } as unknown as SchemaRegistryEntry;
    const config = await runIncrementalUpdate(
      { fields_to_add: [{ field_name: "meta_description", field_type: "string" }] },
      bare
    );

    expect(config.metadata).toEqual({});
  });
});
