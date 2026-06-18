import { describe, expect, it } from "vitest";
import {
  buildDirectedRelationshipRowsFromSourceList,
  filterDirectedRelationshipRows,
  filterDirectedRelationshipRowsByKeyword,
  groupRelationshipRowsByType,
  inferHubEntityIdByRelationshipType,
  type DirectedRelationshipRow,
} from "./relationship_panel_groups";
import type { RelationshipSnapshot } from "../types/api";

function row(
  relType: string,
  otherType: string | null,
  otherName: string,
  otherId = "ent_other",
): DirectedRelationshipRow {
  return {
    rel: {
      relationship_type: relType,
      relationship_key: `${relType}:${otherId}`,
      source_entity_id: "ent_self",
      target_entity_id: otherId,
      observation_count: 1,
    } as RelationshipSnapshot,
    direction: "outgoing",
    otherId,
    otherName,
    otherType,
    otherTypeLabel: null,
  };
}

describe("groupRelationshipRowsByType", () => {
  it("groups by relationship type then entity type, sorted by count", () => {
    const groups = groupRelationshipRowsByType([
      row("PART_OF", "repository", "neotoma", "ent_a"),
      row("PART_OF", "repository", "neotoma-feedback", "ent_b"),
      row("PART_OF", "release", "Neotoma developer release", "ent_c"),
      row("REFERS_TO", "task", "Ship grouping", "ent_d"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.relationshipType).toBe("PART_OF");
    expect(groups[0]!.totalCount).toBe(3);
    expect(groups[0]!.entityTypeGroups).toHaveLength(2);
    expect(groups[0]!.entityTypeGroups[0]!.entityType).toBe("repository");
    expect(groups[0]!.entityTypeGroups[0]!.rows).toHaveLength(2);
    expect(groups[0]!.entityTypeGroups[1]!.entityType).toBe("release");

    expect(groups[1]!.relationshipType).toBe("REFERS_TO");
    expect(groups[1]!.entityTypeGroups[0]!.entityType).toBe("task");
  });

  it("sorts rows within an entity type by last observed (newest first)", () => {
    const older = row("PART_OF", "repository", "alpha", "ent_a");
    older.otherLastObservedAt = "2026-01-01T00:00:00.000Z";
    const newer = row("PART_OF", "repository", "zebra", "ent_z");
    newer.otherLastObservedAt = "2026-05-01T00:00:00.000Z";
    const groups = groupRelationshipRowsByType([older, newer]);
    const names = groups[0]!.entityTypeGroups[0]!.rows.map((r) => r.otherName);
    expect(names).toEqual(["zebra", "alpha"]);
  });

  it("filters rows by keyword across name, id, and formatted date", () => {
    const older = row("PART_OF", "plan", "Parquet to Neotoma migration", "ent_parquet");
    older.otherLastObservedAt = "2026-05-14T12:00:00.000Z";
    const newer = row("PART_OF", "plan", "Agent Swarm Testing Plan", "ent_swarm");
    newer.otherLastObservedAt = "2026-05-18T12:00:00.000Z";
    const rows = [older, newer];

    expect(filterDirectedRelationshipRowsByKeyword(rows, "parquet")).toHaveLength(1);
    expect(filterDirectedRelationshipRowsByKeyword(rows, "2026-05-18")).toHaveLength(1);
    expect(filterDirectedRelationshipRowsByKeyword(rows, "ent_swarm")).toHaveLength(1);
    expect(filterDirectedRelationshipRowsByKeyword(rows, "")).toEqual(rows);
  });

  it("filters rows by relationship and related entity type", () => {
    const rows = [
      row("PART_OF", "plan", "Alpha"),
      row("PART_OF", "plan", "Beta"),
      row("REFERS_TO", "task", "Follow up"),
    ];
    const filtered = filterDirectedRelationshipRows(rows, "PART_OF", "plan");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.otherType === "plan")).toBe(true);
  });

  it("buckets missing entity types under unknown", () => {
    const groups = groupRelationshipRowsByType([
      row("PART_OF", null, "Mystery", "ent_x"),
    ]);
    expect(groups[0]!.entityTypeGroups[0]!.entityType).toBe("unknown");
    expect(groups[0]!.entityTypeGroups[0]!.displayLabel).toBe("Unknown type");
  });
});

describe("buildDirectedRelationshipRowsFromSourceList", () => {
  it("groups many leaf edges toward a hub like entity detail", () => {
    const hub = "ent_hub";
    const relationships = Array.from({ length: 3 }, (_, i) => ({
      relationship_type: "REFERS_TO",
      relationship_key: `REFERS_TO:ent_leaf_${i}:${hub}`,
      source_entity_id: `ent_leaf_${i}`,
      target_entity_id: hub,
      source_entity_type: "workout_session",
      target_entity_type: "contact",
      observation_count: 1,
    })) as import("../types/api").RelationshipSnapshot[];

    const hubs = inferHubEntityIdByRelationshipType(relationships);
    expect(hubs.get("REFERS_TO")).toBe(hub);

    const rows = buildDirectedRelationshipRowsFromSourceList({ relationships });
    const groups = groupRelationshipRowsByType(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.relationshipType).toBe("REFERS_TO");
    expect(groups[0]!.entityTypeGroups[0]!.entityType).toBe("workout_session");
    expect(groups[0]!.entityTypeGroups[0]!.rows).toHaveLength(3);
    expect(groups[0]!.entityTypeGroups[0]!.rows.every((r) => r.otherId.startsWith("ent_leaf_"))).toBe(
      true,
    );
  });
});
