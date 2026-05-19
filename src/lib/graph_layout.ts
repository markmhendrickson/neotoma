import type { CSSProperties } from "react";
import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

export type GraphLayoutMode = "tree" | "radial";

export type GraphNodeKind = "focus" | "entity" | "source" | "stub";

export interface GraphNodeSpec {
  id: string;
  label: string;
  kind: GraphNodeKind;
  raw: Record<string, unknown>;
}

export interface GraphEdgeSpec {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
}

export interface GraphSpec {
  focusId: string;
  nodes: GraphNodeSpec[];
  edges: GraphEdgeSpec[];
}

const TREE_ORIGIN_X = 40;
const TREE_CHILD_X = 360;
const TREE_ROW_SPACING = 72;
const RADIAL_BASE_RADIUS = 200;
const RADIAL_RADIUS_PER_NODE = 6;

function entityId(ent: Record<string, unknown>, fallback: string): string {
  return String(ent.entity_id || ent.id || fallback);
}

function entityLabel(ent: Record<string, unknown>, fallback: string): string {
  return String(ent.canonical_name || ent.entity_type || fallback);
}

/** Deterministic ordering for stable layouts across reloads. */
export function compareGraphNodeSpecs(a: GraphNodeSpec, b: GraphNodeSpec): number {
  const kindOrder: Record<GraphNodeKind, number> = { focus: 0, entity: 1, source: 2, stub: 3 };
  const kindDiff = kindOrder[a.kind] - kindOrder[b.kind];
  if (kindDiff !== 0) return kindDiff;

  const typeA = String(a.raw.entity_type || "");
  const typeB = String(b.raw.entity_type || "");
  const typeDiff = typeA.localeCompare(typeB);
  if (typeDiff !== 0) return typeDiff;

  const labelDiff = a.label.localeCompare(b.label);
  if (labelDiff !== 0) return labelDiff;

  return a.id.localeCompare(b.id);
}

export function buildGraphFromNeighborhood(
  data: Record<string, unknown>,
  focusId: string
): GraphSpec {
  const nodes: GraphNodeSpec[] = [];
  const edges: GraphEdgeSpec[] = [];
  const seen = new Set<string>();

  const centerEntity = data.entity as Record<string, unknown> | undefined;
  if (centerEntity) {
    const eid = entityId(centerEntity, focusId);
    nodes.push({
      id: eid,
      label: entityLabel(centerEntity, eid),
      kind: "focus",
      raw: centerEntity,
    });
    seen.add(eid);
  }

  const relEntities = (data.related_entities || data.entities || []) as Record<string, unknown>[];
  for (let i = 0; i < relEntities.length; i++) {
    const ent = relEntities[i]!;
    const eid = entityId(ent, `ent-${i}`);
    if (seen.has(eid)) continue;
    seen.add(eid);
    nodes.push({
      id: eid,
      label: entityLabel(ent, eid),
      kind: "entity",
      raw: ent,
    });
  }

  const rels = (data.relationships || []) as Record<string, unknown>[];
  for (const rel of rels) {
    const sourceId = String(rel.source_entity_id || "");
    const targetId = String(rel.target_entity_id || "");
    for (const entityIdValue of [sourceId, targetId]) {
      if (!entityIdValue || entityIdValue === focusId || seen.has(entityIdValue)) continue;
      nodes.push({
        id: entityIdValue,
        label: entityIdValue,
        kind: "stub",
        raw: { entity_id: entityIdValue },
      });
      seen.add(entityIdValue);
    }
  }

  rels.forEach((rel, i) => {
    const src = String(rel.source_entity_id || "");
    const tgt = String(rel.target_entity_id || "");
    if (!src || !tgt) return;
    edges.push({
      id: `edge-${i}`,
      source: src,
      target: tgt,
      relationshipType: String(rel.relationship_type || ""),
    });
  });

  const sources = (data.sources || []) as Record<string, unknown>[];
  sources.forEach((src, i) => {
    const sid = String(src.id || `src-${i}`);
    if (seen.has(sid)) return;
    seen.add(sid);
    nodes.push({
      id: sid,
      label: String(src.original_filename || sid),
      kind: "source",
      raw: src,
    });
  });

  return { focusId, nodes, edges };
}

export function applyGraphLayout(
  spec: GraphSpec,
  mode: GraphLayoutMode
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const focus = spec.nodes.find((n) => n.id === spec.focusId || n.kind === "focus");
  const focusId = focus?.id ?? spec.focusId;

  const neighbors = spec.nodes
    .filter((n) => n.id !== focusId)
    .sort(compareGraphNodeSpecs);

  if (mode === "tree") {
    const totalHeight = Math.max(neighbors.length - 1, 0) * TREE_ROW_SPACING;
    const focusY = totalHeight / 2;
    if (focus) {
      positions.set(focusId, { x: TREE_ORIGIN_X, y: focusY });
    }
    neighbors.forEach((node, index) => {
      positions.set(node.id, {
        x: TREE_CHILD_X,
        y: index * TREE_ROW_SPACING,
      });
    });
    return positions;
  }

  const count = Math.max(neighbors.length, 1);
  const radius = RADIAL_BASE_RADIUS + count * RADIAL_RADIUS_PER_NODE;
  const centerX = 400;
  const centerY = Math.max(300, (count * TREE_ROW_SPACING) / 2);

  if (focus) {
    positions.set(focusId, { x: centerX, y: centerY });
  }

  neighbors.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  });

  return positions;
}

function nodeStyle(kind: GraphNodeKind): CSSProperties {
  switch (kind) {
    case "focus":
      return {
        background: "#e0e7ff",
        border: "2px solid #6366f1",
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
        maxWidth: 280,
      };
    case "entity":
      return {
        background: "#f0fdf4",
        border: "1px solid #86efac",
        borderRadius: 8,
        padding: 8,
        fontSize: 11,
        maxWidth: 280,
      };
    case "source":
      return {
        background: "#fef3c7",
        border: "1px solid #fbbf24",
        borderRadius: 8,
        padding: 8,
        fontSize: 11,
        maxWidth: 280,
      };
    default:
      return {
        background: "#f8fafc",
        border: "1px dashed #94a3b8",
        borderRadius: 8,
        padding: 8,
        fontSize: 11,
        maxWidth: 280,
      };
  }
}

export function graphSpecToFlow(
  spec: GraphSpec,
  mode: GraphLayoutMode,
  hoveredEdgeId: string | null
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const positions = applyGraphLayout(spec, mode);

  const flowNodes: Node[] = spec.nodes.map((node) => ({
    id: node.id,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: { label: node.label, raw: node.raw },
    style: nodeStyle(node.kind),
  }));

  const flowEdges: Edge[] = spec.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: hoveredEdgeId === edge.id ? edge.relationshipType : undefined,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.5 },
    labelStyle: { fontSize: 10 },
    data: { relationshipType: edge.relationshipType },
  }));

  return { flowNodes, flowEdges };
}
