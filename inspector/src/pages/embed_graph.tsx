/**
 * Embed graph view — Phase 2 of inspector embed support (#1606).
 *
 * Renders the graph explorer WITHOUT the app shell (no sidebar / header /
 * PageShell wrapper), so it can be loaded in an iframe by an external host.
 *
 * Route: /embed/graph
 *
 * Query parameters:
 *   ?apiBase=<url>   — target API origin (e.g. https://neotoma.example.com)
 *                      Passed to ApiBaseProvider and used by the graph hook.
 *                      Falls back to the Inspector's own configured URL when
 *                      omitted.
 *   ?node=<id>       — pre-load this entity/source ID on mount.
 *
 * Theming: inherits CSS-variable skin tokens from the page (set via the
 * NEOTOMA_INSPECTOR_SKIN mechanism), so the embedding host can apply its own
 * palette without rebuilding the Inspector bundle.
 *
 * Navigation: double-clicking a node in the normal Inspector navigates to
 * /entities/:id. In the embed view that behaviour is suppressed (no-op) since
 * the embed has no Inspector shell to navigate within. Hosts that want
 * click-through should listen to the postMessage event emitted on node
 * double-click (see the onNodeDoubleClick handler below).
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useApiBase } from "@/contexts/api_base_context";
import { useGraphNeighborhoodWithBase } from "@/hooks/use_graph";
import { GraphAreaSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl, SegmentedControlItem } from "@/components/shared/segmented_control";
import { Search } from "lucide-react";
import { showInitialQuerySkeleton } from "@/lib/query_loading";
import {
  buildGraphFromNeighborhood,
  graphSpecToFlow,
  type GraphLayoutMode,
} from "@/lib/graph_layout";
import { GraphAutoFit } from "@/components/shared/graph_auto_fit";
import { ApiBaseProvider } from "@/contexts/api_base_context";

const LAYOUT_STORAGE_KEY = "inspector_graph_layout_mode";

function readStoredLayoutMode(): GraphLayoutMode {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored === "radial" || stored === "tree") return stored;
  } catch {
    /* ignore */
  }
  return "tree";
}

/**
 * Inner graph view — consumes the resolved apiBase from context.
 * Separated so ApiBaseProvider wraps it at the outer layer.
 */
function EmbedGraphView({ initialNodeId }: { initialNodeId: string }) {
  const apiBase = useApiBase();

  const [nodeId, setNodeId] = useState(initialNodeId);
  const [activeNodeId, setActiveNodeId] = useState(initialNodeId);
  const [includeRelationships, setIncludeRelationships] = useState(true);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>(readStoredLayoutMode);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const graph = useGraphNeighborhoodWithBase(
    apiBase,
    activeNodeId
      ? {
          node_id: activeNodeId,
          include_relationships: includeRelationships,
          include_sources: includeSources,
          include_events: includeEvents,
        }
      : null,
  );

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph.data || !activeNodeId) return { flowNodes: [], flowEdges: [] };
    const spec = buildGraphFromNeighborhood(
      graph.data as Record<string, unknown>,
      activeNodeId,
    );
    return graphSpecToFlow(spec, layoutMode, hoveredEdgeId);
  }, [graph.data, activeNodeId, layoutMode, hoveredEdgeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onLayoutModeChange = useCallback((value: string) => {
    if (value !== "tree" && value !== "radial") return;
    setLayoutMode(value as GraphLayoutMode);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * In the embed context, double-clicking a node does NOT navigate within the
   * Inspector (there is no shell). Instead we emit a `postMessage` so the host
   * frame can react (e.g. open the entity in its own UI).
   */
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const raw = node.data?.raw as Record<string, unknown> | undefined;
    if (typeof window !== "undefined" && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "neotoma-inspector-embed:node-dblclick",
          entity_id: raw?.entity_id ?? null,
          source_id: raw?.id ?? null,
          raw,
        },
        "*",
      );
    }
  }, []);

  return (
    <div
      className="flex flex-col min-h-screen w-full"
      data-testid="embed-graph-root"
      data-embed="graph"
    >
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 border-b bg-background shrink-0">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Entity or Source ID…"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === "Enter") setActiveNodeId(nodeId);
            }}
          />
        </div>
        <Button onClick={() => setActiveNodeId(nodeId)} disabled={!nodeId}>
          Explore
        </Button>
        <SegmentedControl
          type="single"
          size="default"
          value={layoutMode}
          onValueChange={onLayoutModeChange}
          aria-label="Graph layout"
        >
          <SegmentedControlItem value="tree" aria-label="Tree layout">
            Tree
          </SegmentedControlItem>
          <SegmentedControlItem value="radial" aria-label="Radial layout">
            Radial
          </SegmentedControlItem>
        </SegmentedControl>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="embed-graph-include-relationships"
              checked={includeRelationships}
              onCheckedChange={setIncludeRelationships}
            />
            <Label htmlFor="embed-graph-include-relationships">Relationships</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="embed-graph-include-sources"
              checked={includeSources}
              onCheckedChange={setIncludeSources}
            />
            <Label htmlFor="embed-graph-include-sources">Sources</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="embed-graph-include-events"
              checked={includeEvents}
              onCheckedChange={setIncludeEvents}
            />
            <Label htmlFor="embed-graph-include-events">Events</Label>
          </div>
        </div>
      </div>

      {/* Graph canvas — fills remaining height */}
      <div className="flex-1 bg-background min-h-[calc(100dvh-5rem)]">
        {showInitialQuerySkeleton(graph) ? (
          <GraphAreaSkeleton />
        ) : graph.error && activeNodeId ? (
          <div className="flex h-full items-center justify-center p-6">
            <QueryErrorAlert title="Could not load graph">
              {graph.error.message}
            </QueryErrorAlert>
          </div>
        ) : !activeNodeId ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Enter an entity or source ID to explore its neighborhood.
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No graph data found.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edgesState}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
            onEdgeMouseLeave={() => setHoveredEdgeId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <GraphAutoFit nodeIds={nodes.map((n) => n.id)} />
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

/**
 * Outer route component. Reads `?apiBase=` and `?node=` from the URL and
 * wraps the view in an `ApiBaseProvider` so the injected base flows down.
 */
export default function EmbedGraphPage() {
  const [searchParams] = useSearchParams();
  const apiBaseParam = searchParams.get("apiBase") ?? "";
  const initialNodeId = searchParams.get("node") ?? "";

  return (
    <ApiBaseProvider apiBase={apiBaseParam}>
      <EmbedGraphView initialNodeId={initialNodeId} />
    </ApiBaseProvider>
  );
}
