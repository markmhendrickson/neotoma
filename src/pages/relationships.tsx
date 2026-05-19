import { Link } from "react-router-dom";
import { useRelationships } from "@/hooks/use_relationships";
import { useCreateRelationship } from "@/hooks/use_mutations";
import { PageShell } from "@/components/layout/page_shell";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/shared/entity_link";
import { AgentBadge } from "@/components/shared/agent_badge";
import { useAgentAttributionFilter } from "@/components/shared/agent_filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RELATIONSHIP_TYPES } from "@/lib/constants";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { RelationshipSnapshot } from "@/types/api";

export default function RelationshipsPage() {
  const relationships = useRelationships();
  const createMut = useCreateRelationship();

  const [createType, setCreateType] = useState("");
  const [createSource, setCreateSource] = useState("");
  const [createTarget, setCreateTarget] = useState("");

  const columns: ColumnDef<RelationshipSnapshot, unknown>[] = [
    {
      header: "Type",
      accessorKey: "relationship_type",
      cell: ({ getValue }) => <span className="font-mono text-xs font-medium">{getValue() as string}</span>,
    },
    {
      header: "Source Entity",
      accessorKey: "source_entity_id",
      cell: ({ getValue }) => <EntityLink id={getValue() as string} />,
    },
    {
      header: "Target Entity",
      accessorKey: "target_entity_id",
      cell: ({ getValue }) => <EntityLink id={getValue() as string} />,
    },
    { header: "Observations", accessorKey: "observation_count" },
    { header: "Last Observed", accessorKey: "last_observation_at", cell: ({ getValue }) => formatDate(getValue() as string) },
    {
      header: "Agent",
      id: "agent",
      cell: ({ row }) => (
        <AgentBadge provenance={row.original.agent_attribution ?? null} />
      ),
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Link
            to={`/relationships/${encodeURIComponent(r.relationship_key || `${r.relationship_type}:${r.source_entity_id}:${r.target_entity_id}`)}`}
            className="text-xs text-primary hover:underline"
          >
            Detail
          </Link>
        );
      },
    },
  ];

  return (
    <PageShell
      title="Relationships"
      meta={
        relationships.data
          ? `${relationships.data.relationships.length.toLocaleString()} total`
          : undefined
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {showBackgroundQueryRefresh(relationships) ? <QueryRefreshIndicator /> : null}
          <Dialog>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-3 w-3 mr-1" /> Create</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Relationship</DialogTitle><DialogDescription>Create a typed edge between two entities.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Type</Label>
                <Select value={createType} onValueChange={setCreateType}>
                  <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Source Entity ID</Label><Input value={createSource} onChange={(e) => setCreateSource(e.target.value)} /></div>
              <div><Label>Target Entity ID</Label><Input value={createTarget} onChange={(e) => setCreateTarget(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                if (!createType || !createSource || !createTarget) return;
                createMut.mutate(
                  { relationship_type: createType, source_entity_id: createSource, target_entity_id: createTarget },
                  { onSuccess: () => { toast.success("Relationship created"); setCreateType(""); setCreateSource(""); setCreateTarget(""); } }
                );
              }}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      }
    >
      <RelationshipsTable query={relationships} columns={columns} />
    </PageShell>
  );
}

function RelationshipsTable({
  query,
  columns,
}: {
  query: ReturnType<typeof useRelationships>;
  columns: ColumnDef<RelationshipSnapshot, unknown>[];
}) {
  const rows = query.data?.relationships ?? [];
  const { filterRows, AgentFilterControl } = useAgentAttributionFilter(rows);
  const displayed = filterRows(rows);

  if (showInitialQuerySkeleton(query)) return <DataTableSkeleton rows={12} cols={7} />;
  if (query.error)
    return <QueryErrorAlert title="Could not load relationships">{query.error.message}</QueryErrorAlert>;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <AgentFilterControl />
      </div>
      <DataTable columns={columns} data={displayed} />
    </>
  );
}
