import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateSchemaIncrementalRequestSchema } from "../../src/shared/action_schemas.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";

const catalog = vi.hoisted(() => ({
  rows: [] as any[],
  error: null as unknown,
  omitCount: false,
  countOverride: null as number | null,
}));
vi.mock("../../src/db.js", () => ({
  db: {
    from: vi.fn(() => {
      const query: any = {
        select: () => query,
        eq: () => query,
        or: () => query,
        then: (resolve: any) =>
          Promise.resolve({
            data: catalog.rows,
            error: catalog.error,
            ...(catalog.omitCount ? {} : { count: catalog.countOverride ?? catalog.rows.length }),
          }).then(resolve),
      };
      return query;
    }),
  },
}));

const definition = {
  fields: { label: { type: "string", required: false } },
  identity_opt_out: "heuristic_canonical_name",
};
const row = (type = "arbitrary_stratum", planning: unknown = { level: 17, read_only: true }) => ({
  entity_type: type,
  schema_version: "1.0.0",
  schema_definition: { ...definition, planning },
  scope: "global",
  user_id: null,
});

describe("validated planning declarations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    catalog.rows = [];
    catalog.error = null;
    catalog.omitCount = false;
    catalog.countOverride = null;
  });

  it("admits a standalone planning change without manufacturing scope intent", () => {
    const value = UpdateSchemaIncrementalRequestSchema.parse({
      entity_type: "arbitrary_stratum",
      planning: { level: -3.5, read_only: true },
    });
    expect(value).toMatchObject({ planning: { level: -3.5, read_only: true } });
    expect(value.user_specific).toBeUndefined();
  });

  it.each([
    null,
    false,
    {},
    { level: true },
    { level: "10" },
    { level: NaN },
    { level: Infinity },
    { level: 10, read_only: "false" },
    { level: 10, unexpected: true },
  ])("refuses malformed declarations through the existing service validator: %j", (planning) => {
    const registry = new SchemaRegistryService();
    expect(() => (registry as any).validateSchemaDefinition({ ...definition, planning })).toThrow(
      /planning/i
    );
  });

  it("carries fields, reducer policy, identity and security metadata across a declaration-only update", async () => {
    const registry = new SchemaRegistryService();
    const current: any = {
      ...row(),
      id: "synthetic-schema",
      active: true,
      reducer_config: { merge_policies: { label: { strategy: "last_write" } } },
      metadata: { icon: "shape", guest_access_policy: "read_only" },
    };
    vi.spyOn(registry, "loadActiveSchema").mockResolvedValue(current);
    vi.spyOn(registry as any, "withSchemaMutation").mockImplementation((fn: any) => fn());
    vi.spyOn(registry as any, "activateRowInTransaction").mockResolvedValue(undefined);
    const registered = vi
      .spyOn(registry, "register")
      .mockImplementation(async (input: any) => ({ ...current, ...input }));
    await registry.updateSchemaIncremental({
      entity_type: current.entity_type,
      planning: { level: 28 },
    } as any);
    const sent: any = registered.mock.calls[0][0];
    expect(sent.schema_definition).toEqual({ ...definition, planning: { level: 28 } });
    expect(sent.reducer_config).toEqual(current.reducer_config);
    expect(sent.metadata).toEqual(current.metadata);
  });

  it("projects declarations from a complete scoped census without full field definitions", async () => {
    catalog.rows = [
      row("arbitrary_low", { level: 2 }),
      row("arbitrary_high", { level: 100, read_only: true }),
    ];
    const registry = new SchemaRegistryService();
    const result = await (registry as any).listEntityTypesResult(undefined, "synthetic-owner");
    expect(result.registry_coverage).toMatchObject({
      version: "1",
      state: "complete",
      source: "registry",
      total: 2,
      returned_count: 2,
    });
    expect(result.entity_types.map((item: any) => item.planning)).toEqual([
      { level: 2 },
      { level: 100, read_only: true },
    ]);
    expect(result.entity_types[0]).not.toHaveProperty("schema_definition");
  });

  it("keeps database fallback and filtered catalogs explicitly unknown", async () => {
    const registry = new SchemaRegistryService();
    catalog.error = new Error("synthetic registry read failure");
    const failed = await (registry as any).listEntityTypesResult(undefined, "synthetic-owner");
    expect(failed.registry_coverage).toMatchObject({ state: "unknown", source: "code_fallback" });
    expect(failed.registry_coverage.reasons).toContain("registry_read_failed");
    catalog.error = null;
    catalog.rows = [row()];
    const filtered = await (registry as any).listEntityTypesResult("arbitrary", "synthetic-owner");
    expect(filtered.registry_coverage.state).toBe("unknown");
    expect(filtered.registry_coverage.reasons).toContain("filtered");
  });

  it("refuses completeness for missing, truncated or contradictory acquisitions", async () => {
    const registry = new SchemaRegistryService();
    catalog.rows = [row()];
    catalog.omitCount = true;
    expect(
      (await registry.listEntityTypesResult(undefined, "synthetic-owner")).registry_coverage
    ).toMatchObject({ state: "unknown", total: null, exhausted: false });
    catalog.omitCount = false;
    catalog.countOverride = 2;
    expect(
      (await registry.listEntityTypesResult(undefined, "synthetic-owner")).registry_coverage.state
    ).toBe("unknown");
    catalog.countOverride = null;
    catalog.rows = [row(), row()];
    expect(
      (await registry.listEntityTypesResult(undefined, "synthetic-owner")).registry_coverage.reasons
    ).toContain("duplicate_registry_row");
    catalog.rows = [{ ...row("foreign_private_type"), scope: "user", user_id: "foreign-owner" }];
    const foreign = await registry.listEntityTypesResult(undefined, "synthetic-owner");
    expect(foreign.entity_types).toEqual([]);
    expect(foreign.registry_coverage).toMatchObject({ state: "unknown", total: null });
  });

  it("preserves an omitted declaration during an unrelated field update", async () => {
    const registry = new SchemaRegistryService();
    const current: any = {
      ...row(),
      id: "synthetic-preservation",
      active: true,
      reducer_config: { merge_policies: { label: { strategy: "last_write" } } },
      metadata: { icon: "shape" },
    };
    vi.spyOn(registry, "loadActiveSchema").mockResolvedValue(current);
    vi.spyOn(registry as any, "withSchemaMutation").mockImplementation((fn: any) => fn());
    vi.spyOn(registry as any, "activateRowInTransaction").mockResolvedValue(undefined);
    const register = vi
      .spyOn(registry, "register")
      .mockImplementation(async (input: any) => ({ ...current, ...input }));
    await registry.updateSchemaIncremental({
      entity_type: current.entity_type,
      fields_to_add: [{ field_name: "detail", field_type: "string" }],
    });
    expect(register.mock.calls[0][0].schema_definition.planning).toEqual(
      current.schema_definition.planning
    );
  });

  it("does not hide invalid legacy declarations behind a complete census", async () => {
    catalog.rows = [row("arbitrary_stratum", { level: "high" })];
    const result = await (new SchemaRegistryService() as any).listEntityTypesResult(
      undefined,
      "synthetic-owner"
    );
    expect(result.registry_coverage.state).toBe("unknown");
    expect(result.registry_coverage.reasons).toContain("invalid_planning_declaration");
    expect(result.entity_types[0]).toMatchObject({ planning_error: "invalid_declaration" });
  });
});
