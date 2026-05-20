import { describe, expect, it } from "vitest";
import {
  applyGraphLayout,
  buildGraphFromNeighborhood,
  compareGraphNodeSpecs,
  graphSpecToFlow,
  type GraphNodeSpec,
} from "./graph_layout";

describe("graph_layout", () => {
  it("sorts neighbors by entity_type then label", () => {
    const specs: GraphNodeSpec[] = [
      { id: "b", label: "Beta", kind: "entity", raw: { entity_type: "plan" } },
      { id: "a", label: "Alpha", kind: "entity", raw: { entity_type: "note" } },
      { id: "c", label: "Gamma", kind: "entity", raw: { entity_type: "plan" } },
    ];
    const sorted = [...specs].sort(compareGraphNodeSpecs);
    expect(sorted.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("builds graph spec with focus and related entities", () => {
    const spec = buildGraphFromNeighborhood(
      {
        entity: { id: "ent_focus", canonical_name: "neotoma", entity_type: "company" },
        related_entities: [{ id: "ent_a", canonical_name: "Plan A", entity_type: "plan" }],
        relationships: [
          { source_entity_id: "ent_a", target_entity_id: "ent_focus", relationship_type: "REFERS_TO" },
        ],
      },
      "ent_focus"
    );
    expect(spec.nodes).toHaveLength(2);
    expect(spec.edges).toHaveLength(1);
    expect(spec.edges[0]?.relationshipType).toBe("REFERS_TO");
  });

  it("places tree layout with focus left and children in a column", () => {
    const spec = buildGraphFromNeighborhood(
      {
        entity: { id: "ent_focus", canonical_name: "root" },
        related_entities: [
          { id: "ent_1", canonical_name: "One" },
          { id: "ent_2", canonical_name: "Two" },
        ],
        relationships: [],
      },
      "ent_focus"
    );
    const positions = applyGraphLayout(spec, "tree");
    const focus = positions.get("ent_focus")!;
    const child1 = positions.get("ent_1")!;
    const child2 = positions.get("ent_2")!;
    expect(focus.x).toBeLessThan(child1.x);
    expect(child1.x).toBe(child2.x);
    expect(child1.y).toBeLessThan(child2.y);
  });

  it("hides edge labels until hovered", () => {
    const spec = buildGraphFromNeighborhood(
      {
        entity: { id: "ent_focus" },
        related_entities: [{ id: "ent_a" }],
        relationships: [
          { source_entity_id: "ent_a", target_entity_id: "ent_focus", relationship_type: "REFERS_TO" },
        ],
      },
      "ent_focus"
    );
    const hidden = graphSpecToFlow(spec, "tree", null);
    expect(hidden.flowEdges[0]?.label).toBeUndefined();

    const shown = graphSpecToFlow(spec, "tree", "edge-0");
    expect(shown.flowEdges[0]?.label).toBe("REFERS_TO");
  });
});
