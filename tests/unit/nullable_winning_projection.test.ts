import { it, expect } from "vitest";
import { ObservationReducer, type Observation } from "../../src/reducers/observation_reducer.js";
import type { SchemaRegistryEntry } from "../../src/services/schema_registry.js";
const id = "ent_owned_nullable_strategy",
  owner = "owned-projection-user",
  kind = "owned_nullable_strategy";
const reducer = new ObservationReducer();
function row(id: string, value: unknown, newer: boolean, higher: boolean): Observation {
  return {
    id,
    entity_id: "ent_owned_nullable_strategy",
    entity_type: kind,
    user_id: owner,
    schema_version: "1.0",
    source_id: "",
    observed_at: newer ? "2026-02-01T00:00:00Z" : "2026-01-01T00:00:00Z",
    created_at: "2026-02-01T00:00:00Z",
    source_priority: higher ? 1000 : 1,
    specificity_score: higher ? 1 : 0.1,
    fields: { value },
  };
}
function schema(strategy: string): SchemaRegistryEntry {
  return {
    id: "owned-active-schema",
    entity_type: kind,
    schema_version: "1.0",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    schema_definition: {
      fields: { value: { type: "array" }, absent: { type: "string" } },
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: { merge_policies: { value: { strategy } } },
  } as SchemaRegistryEntry;
}
const context = {
  acquisition: "complete" as const,
  mode: "pre_migration" as const,
  target: { id, user_id: owner, entity_type: kind },
};
it.each(["last_write", "highest_priority", "most_specific"])(
  "%s uses the same selected null and origin while retaining default omission",
  async (strategy) => {
    const rows = [row("old", [1], false, false), row("clear", null, true, true)];
    const defaultView = await reducer.computeSnapshot(id, rows, schema(strategy), context);
    expect(defaultView!.snapshot).not.toHaveProperty("value");
    expect(defaultView!.provenance).not.toHaveProperty("value");
    const opt = await reducer.computeSnapshot(id, rows, schema(strategy), context, {
      includeClearedFields: true,
    });
    expect(opt).toMatchObject({
      cleared_fields_included: true,
      snapshot: { value: null },
      provenance: { value: "clear" },
    });
    expect(opt!.snapshot).not.toHaveProperty("absent");
  }
);
it.each(["last_write", "highest_priority", "most_specific"])(
  "%s never substitutes a losing null as the winner",
  async (strategy) => {
    const opt = await reducer.computeSnapshot(
      id,
      [row("clear", null, false, false), row("winner", [1], true, true)],
      schema(strategy),
      context,
      { includeClearedFields: true }
    );
    expect(opt!.snapshot.value).toEqual([1]);
    expect(opt!.provenance.value).toBe("winner");
  }
);
it("merge_array uses its existing result, not a fabricated null-clear rule", async () => {
  const rows = [row("clear", null, true, true), row("old", [1], false, false)];
  const original = await reducer.computeSnapshot(id, rows, schema("merge_array"), context);
  const opt = await reducer.computeSnapshot(id, rows, schema("merge_array"), context, {
    includeClearedFields: true,
  });
  expect(opt!.snapshot).toEqual(original!.snapshot);
  expect(opt!.provenance).toEqual(original!.provenance);
});
