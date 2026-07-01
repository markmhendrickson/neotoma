import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphNeighborhood } from "@/hooks/use_graph";
import { PageShell } from "@/components/layout/page_shell";
import { GraphAreaSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl, SegmentedControlItem } from "@/components/shared/segmented_control";
import { JsonViewer } from "@/components/shared/json_viewer";
import { Search } from "lucide-react";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import {
  buildGraphFromNeighborhood,
  graphSpecToFlow,
  type GraphLayoutMode,
} from "@/lib/graph_layout";
import { GraphAutoFit } from "@/components/shared/graph_auto_fit";
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

export default function GraphExplorerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [nodeId, setNodeId] = useState(searchParams.get("node") || "");
  const [activeNodeId, setActiveNodeId] = useState(searchParams.get("node") || "");
  const [includeRelationships, setIncludeRelationships] = useState(true);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Record<string, unknown> | null>(null);
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>(readStoredLayoutMode);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const graph = useGraphNeighborhood(
    activeNodeId ? { node_id: activeNodeId, include_relationships: includeRelationships, include_sources: includeSources, include_events: includeEvents } : null
  );

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph.data || !activeNodeId) return { flowNodes: [], flowEdges: [] };
    const spec = buildGraphFromNeighborhood(graph.data as Record<string, unknown>, activeNodeId);
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
    setLayoutMode(value);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data?.raw as Record<string, unknown> ?? null);
  }, []);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const raw = node.data?.raw as Record<string, unknown> | undefined;
    if (raw?.entity_id) {
      navigate(`/entities/${encodeURIComponent(String(raw.entity_id))}`);
    } else if (raw?.id) {
      navigate(`/sources/${encodeURIComponent(String(raw.id))}`);
    }
  }, [navigate]);

  return (
    <PageShell
      title="Graph Explorer"
      description="Interactive neighborhood visualization"
      actions={showBackgroundQueryRefresh(graph) ? <QueryRefreshIndicator /> : undefined}
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative min-w-[250px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Entity or Source ID…"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            className="pl-9"
            onKeyDown={(e) => { if (e.key === "Enter") setActiveNodeId(nodeId); }}
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
              id="graph-include-relationships"
              checked={includeRelationships}
              onCheckedChange={setIncludeRelationships}
            />
            <Label htmlFor="graph-include-relationships">Relationships</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="graph-include-sources"
              checked={includeSources}
              onCheckedChange={setIncludeSources}
            />
            <Label htmlFor="graph-include-sources">Sources</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="graph-include-events"
              checked={includeEvents}
              onCheckedChange={setIncludeEvents}
            />
            <Label htmlFor="graph-include-events">Events</Label>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 h-[600px] rounded-lg border bg-background">
          {showInitialQuerySkeleton(graph) ? (
            <GraphAreaSkeleton />
          ) : graph.error && activeNodeId ? (
            <div className="flex h-full items-center justify-center p-6">
              <QueryErrorAlert title="Could not load graph">{graph.error.message}</QueryErrorAlert>
            </div>
          ) : !activeNodeId ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Enter an entity or source ID to explore its neighborhood.</div>
          ) : nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">No graph data found.</div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edgesState}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
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

        {selectedNode && (
          <Card className="w-80 shrink-0 max-h-[600px] overflow-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Node Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonViewer data={selectedNode} defaultExpanded />
              <div className="mt-3 flex gap-2">
                {selectedNode["entity_id"] != null && (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/entities/${encodeURIComponent(String(selectedNode["entity_id"]))}`)}>
                    View Entity
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {activeNodeId ? (
        <Card className="mt-4">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Graph neighborhood</CardTitle>
            <p className="text-sm text-muted-foreground">
              Raw API response for{" "}
              <span className="font-mono text-xs">{activeNodeId}</span> (relationships, related
              entities, counts).
            </p>
          </CardHeader>
          <CardContent>
            {showInitialQuerySkeleton(graph) ? (
              <div className="max-h-48">
                <GraphAreaSkeleton />
              </div>
            ) : graph.error ? (
              <QueryErrorAlert title="Could not load neighborhood">
                {graph.error.message}
              </QueryErrorAlert>
            ) : graph.data ? (
              <JsonViewer data={graph.data} defaultExpanded />
            ) : (
              <p className="text-sm text-muted-foreground">No graph data available.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
