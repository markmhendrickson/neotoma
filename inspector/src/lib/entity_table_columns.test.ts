import { describe, expect, it } from "vitest";
import {
  buildEntitiesListColumnConfig,
  buildVisibleEntitySortOptions,
  columnIdToApiSortBy,
  DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY,
  isEntitiesListColumnSortable,
  parseSnapshotFieldColumnId,
  schemaFieldKeys,
  snapshotFieldColumnId,
} from "./entity_table_columns";

describe("entity_table_columns", () => {
  it("hides type, admission, and observations by default", () => {
    expect(DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY.name).toBe(true);
    expect(DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY.type).toBe(false);
    expect(DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY.admission).toBe(false);
    expect(DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY.observations).toBe(false);
  });

  it("encodes snapshot field column ids", () => {
    expect(snapshotFieldColumnId("due_date")).toBe("snapshot:due_date");
    expect(parseSnapshotFieldColumnId("snapshot:due_date")).toBe("due_date");
    expect(parseSnapshotFieldColumnId("name")).toBeNull();
  });

  it("maps sortable columns to API sort_by values", () => {
    expect(columnIdToApiSortBy("name")).toBe("canonical_name");
    expect(columnIdToApiSortBy("snapshot:due_date")).toBe("snapshot:due_date");
    expect(columnIdToApiSortBy("type")).toBeNull();
    expect(isEntitiesListColumnSortable("admission")).toBe(false);
    expect(isEntitiesListColumnSortable("observations")).toBe(true);
  });

  it("builds sort options from visible columns only", () => {
    const visibility = {
      name: true,
      type: true,
      last_observation_at: false,
      "snapshot:status": true,
    };
    const options = buildVisibleEntitySortOptions(
      ["name", "type", "last_observation_at", "snapshot:status"],
      visibility,
      {
        name: "Name",
        type: "Type",
        last_observation_at: "Last observation",
        "snapshot:status": "Status",
      },
    );
    expect(options.map((o) => o.value)).toEqual(["canonical_name", "snapshot:status"]);
    expect(options.map((o) => o.label)).toEqual(["Name", "Status"]);
  });

  it("includes all schema fields in column config", () => {
    const schema = {
      entity_type: "task",
      schema_definition: {
        fields: {
          title: { type: "string" },
          status: { type: "string" },
          due_date: { type: "date" },
        },
      },
    };
    expect(schemaFieldKeys(schema)).toEqual(["title", "status", "due_date"]);

    const { columnIds, columnLabels, defaultVisibility } = buildEntitiesListColumnConfig(schema);
    expect(columnIds).toContain("snapshot:title");
    expect(columnIds).toContain("snapshot:status");
    expect(columnLabels["snapshot:due_date"]).toBe("Due date");
    expect(defaultVisibility["snapshot:title"]).toBe(false);
  });
});
