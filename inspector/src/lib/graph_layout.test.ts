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
          {
            source_entity_id: "ent_a",
            target_entity_id: "ent_focus",
            relationship_type: "REFERS_TO",
          },
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

  // Regression for the Inspector blank-canvas bug (Jeroen repro / embed task
  // ent_a876f38dd8ed65eb2ad331ee): React Flow silently drops edges and no-ops
  // `fitView` when nodes have no dimensions. `graphSpecToFlow` must emit
  // `initialWidth`/`initialHeight` on every node so edge geometry and
  // `getNodesBounds` have a fallback before measurement, and every edge must
  // reference two node ids that actually exist in the flow node set. Shared by
  // the standalone /graph explorer and /embed/graph.
  it("emits finite positions, dimension hints, and edges wired to real nodes for Jeroen's shape", () => {
    // Exact server response shape (from prod retrieve_graph_neighborhood):
    // `entity` + `related_entities` are `entities` rows (field `id`);
    // `relationships` are `relationship_snapshots` rows.
    const spec = buildGraphFromNeighborhood(
      {
        node_id: "ent_focus_contact",
        node_type: "entity",
        entity: {
          id: "ent_focus_contact",
          entity_type: "contact",
          canonical_name: "Naresh Sital",
        },
        relationships: [
          {
            source_entity_id: "ent_msg_a",
            target_entity_id: "ent_focus_contact",
            relationship_type: "REFERS_TO",
          },
          {
            source_entity_id: "ent_msg_b",
            target_entity_id: "ent_focus_contact",
            relationship_type: "REFERS_TO",
          },
        ],
        related_entities: [
          { id: "ent_msg_a", entity_type: "conversation_message", canonical_name: "msg a" },
          { id: "ent_msg_b", entity_type: "conversation_message", canonical_name: "msg b" },
        ],
      },
      "ent_focus_contact"
    );

    const { flowNodes, flowEdges } = graphSpecToFlow(spec, "tree", null);

    expect(flowNodes).toHaveLength(3);
    expect(flowEdges).toHaveLength(2);

    for (const node of flowNodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      // Dimension hints back edge geometry + fitView bounds before measurement.
      expect(node.initialWidth).toBeGreaterThan(0);
      expect(node.initialHeight).toBeGreaterThan(0);
    }

    const nodeIds = new Set(flowNodes.map((n) => n.id));
    for (const edge of flowEdges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it("hides edge labels until hovered", () => {
    const spec = buildGraphFromNeighborhood(
      {
        entity: { id: "ent_focus" },
        related_entities: [{ id: "ent_a" }],
        relationships: [
          {
            source_entity_id: "ent_a",
            target_entity_id: "ent_focus",
            relationship_type: "REFERS_TO",
          },
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
