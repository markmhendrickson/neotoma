import { describe, expect, it, vi } from "vitest";

import { PLAN_ENTITY_TYPE, PLAN_FIELD_SPECS, seedPlanSchema } from "./seed_schema.js";

interface FakeRegistryShape {
  loadGlobalSchema: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  updateSchemaIncremental: ReturnType<typeof vi.fn>;
}

function makeRegistry(
  initial: {
    exists: boolean;
    existingFields?: string[];
    hasAgentInstructions?: boolean;
  } = { exists: false }
): FakeRegistryShape {
  const existingFields = initial.existingFields ?? [];
  const agentInstructions =
    initial.hasAgentInstructions === true ? "existing instructions" : undefined;
  return {
    loadGlobalSchema: vi.fn(async () =>
      initial.exists
        ? {
            entity_type: PLAN_ENTITY_TYPE,
            schema_version: "1.0",
            schema_definition: {
              fields: Object.fromEntries(
                existingFields.map((name) => [name, { type: "string" as const }])
              ),
              ...(agentInstructions !== undefined ? { agent_instructions: agentInstructions } : {}),
            },
            reducer_config: { merge_policies: {} },
          }
        : null
    ),
    register: vi.fn(async (entry) => entry),
    updateSchemaIncremental: vi.fn(async (entry) => entry),
  };
}

describe("seedPlanSchema", () => {
  it("registers a fresh `plan` schema with the documented fields and identity rules", async () => {
    const registry = makeRegistry({ exists: false });
    const result = await seedPlanSchema({
      registry: registry as unknown as Parameters<typeof seedPlanSchema>[0]["registry"],
    });
    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(registry.updateSchemaIncremental).not.toHaveBeenCalled();
    const registered = registry.register.mock.calls[0]?.[0] as {
      entity_type: string;
      schema_definition: {
        fields: Record<string, unknown>;
        canonical_name_fields: unknown;
      };
      reducer_config: { merge_policies: Record<string, { strategy: string }> };
      user_specific?: boolean;
    };
    expect(registered.entity_type).toBe("plan");
    expect(registered.user_specific).toBe(false);
    for (const spec of PLAN_FIELD_SPECS) {
      expect(registered.schema_definition.fields[spec.name]).toBeDefined();
    }
    expect(registered.schema_definition.canonical_name_fields).toEqual([
      { composite: ["harness", "harness_plan_id"] },
      { composite: ["source_entity_id", "title"] },
      "slug",
      "title",
    ]);
    // Each plan revision rewrites the full todo list, so last_write keeps
    // snapshot state consistent with the harness markdown file.
    expect(registered.reducer_config.merge_policies.todos.strategy).toBe("last_write");
    // Decision blockers may accumulate across observations, so merge_array.
    expect(registered.reducer_config.merge_policies.decision_blockers.strategy).toBe("merge_array");
    expect(result).toBeDefined();
  });

  it("incrementally adds missing fields when an older schema row exists", async () => {
    const registry = makeRegistry({
      exists: true,
      existingFields: ["title", "slug", "harness", "harness_plan_id", "body"],
      hasAgentInstructions: true, // instructions already set — field update only
    });
    await seedPlanSchema({
      registry: registry as unknown as Parameters<typeof seedPlanSchema>[0]["registry"],
    });
    expect(registry.register).not.toHaveBeenCalled();
    expect(registry.updateSchemaIncremental).toHaveBeenCalledTimes(1);
    const update = registry.updateSchemaIncremental.mock.calls[0]?.[0] as {
      fields_to_add: Array<{ field_name: string }>;
    };
    const fieldNames = update.fields_to_add.map((f) => f.field_name);
    expect(fieldNames).toContain("plan_kind");
    expect(fieldNames).toContain("decision_required");
    expect(fieldNames).toContain("public_overview");
    expect(fieldNames).toContain("worktree_path");
    expect(fieldNames).not.toContain("title"); // already present
  });

  it("skips all writes when every field and agent_instructions are already present", async () => {
    const registry = makeRegistry({
      exists: true,
      existingFields: PLAN_FIELD_SPECS.map((s) => s.name),
      hasAgentInstructions: true,
    });
    await seedPlanSchema({
      registry: registry as unknown as Parameters<typeof seedPlanSchema>[0]["registry"],
    });
    expect(registry.register).not.toHaveBeenCalled();
    expect(registry.updateSchemaIncremental).not.toHaveBeenCalled();
  });

  it("patches agent_instructions via register when fields are complete but instructions absent", async () => {
    const registry = makeRegistry({
      exists: true,
      existingFields: PLAN_FIELD_SPECS.map((s) => s.name),
      hasAgentInstructions: false,
    });
    await seedPlanSchema({
      registry: registry as unknown as Parameters<typeof seedPlanSchema>[0]["registry"],
    });
    expect(registry.updateSchemaIncremental).not.toHaveBeenCalled();
    expect(registry.register).toHaveBeenCalledTimes(1);
    const registered = registry.register.mock.calls[0]?.[0] as {
      schema_definition: { agent_instructions?: string };
    };
    expect(typeof registered.schema_definition.agent_instructions).toBe("string");
    expect(registered.schema_definition.agent_instructions!.length).toBeGreaterThan(0);
  });
});
