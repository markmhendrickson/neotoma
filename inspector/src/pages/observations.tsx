import { useState } from "react";
import { isApiUrlConfigured } from "@/api/client";
import { useObservationsQuery } from "@/hooks/use_observations";
import { useCreateObservation } from "@/hooks/use_mutations";
import { PageShell } from "@/components/layout/page_shell";
import { ApiNotConfiguredState } from "@/components/shared/api_not_configured_state";
import { EmptyState } from "@/components/shared/empty_state";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/shared/entity_link";
import { SourceLink } from "@/components/shared/source_link";
import { TypeBadge } from "@/components/shared/type_badge";
import { AgentBadge } from "@/components/shared/agent_badge";
import { useAgentAttributionFilter } from "@/components/shared/agent_filter";
import { JsonViewer } from "@/components/shared/json_viewer";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { toast } from "sonner";
import { Plus, Search, ListChecks } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Observation } from "@/types/api";

const PAGE_SIZE = 25;

export default function ObservationsPage() {
  const [entityId, setEntityId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [offset, setOffset] = useState(0);

  const [createEntityId, setCreateEntityId] = useState("");
  const [createEntityType, setCreateEntityType] = useState("");
  const [createFields, setCreateFields] = useState("{}");
  const createMut = useCreateObservation();

  const query = useObservationsQuery({
    entity_id: entityId || undefined,
    entity_type: entityType || undefined,
    source_id: sourceId || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const [expanded, setExpanded] = useState<string | null>(null);

  const filtersActive = Boolean(entityId || entityType || sourceId);

  if (!isApiUrlConfigured()) {
    return (
      <PageShell title="Observations">
        <ApiNotConfiguredState />
      </PageShell>
    );
  }

  const observations = query.data?.observations ?? [];
  const { filterRows, AgentFilterControl } =
    useAgentAttributionFilter(observations);
  const displayed = filterRows(observations);

  const columns: ColumnDef<Observation, unknown>[] = [
    {
      header: "Entity",
      accessorKey: "entity_id",
      cell: ({ row }) => (
        <div>
          <EntityLink id={row.original.entity_id} />
          <div className="mt-0.5"><TypeBadge type={row.original.entity_type} /></div>
        </div>
      ),
    },
    {
      header: "Source",
      accessorKey: "source_id",
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <SourceLink id={v} /> : <span className="text-muted-foreground">—</span>;
      },
    },
    { header: "Priority", accessorKey: "source_priority" },
    { header: "Specificity", accessorKey: "specificity_score", cell: ({ getValue }) => (getValue() as number)?.toFixed(2) ?? "—" },
    { header: "Observed", accessorKey: "observed_at", cell: ({ getValue }) => formatDate(getValue() as string) },
    {
      header: "Agent",
      id: "agent",
      cell: ({ row }) => (
        <AgentBadge provenance={row.original.provenance ?? null} />
      ),
    },
    {
      header: "Fields",
      id: "field_count",
      cell: ({ row }) => {
        const fields = row.original.fields;
        const count = fields ? Object.keys(fields).length : 0;
        return (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === row.original.id ? null : row.original.id)}>
            {count} fields {expanded === row.original.id ? "▾" : "▸"}
          </Button>
        );
      },
    },
  ];

  return (
    <PageShell
      title="Observations"
      meta={query.data ? `${query.data.total.toLocaleString()} total` : undefined}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {showBackgroundQueryRefresh(query) ? <QueryRefreshIndicator /> : null}
          <Dialog>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-3 w-3 mr-1" /> Create</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Observation</DialogTitle><DialogDescription>Directly create an observation for an entity.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Entity ID</Label><Input value={createEntityId} onChange={(e) => setCreateEntityId(e.target.value)} /></div>
              <div><Label>Entity Type</Label><Input value={createEntityType} onChange={(e) => setCreateEntityType(e.target.value)} /></div>
              <div><Label>Fields (JSON)</Label><Textarea value={createFields} onChange={(e) => setCreateFields(e.target.value)} rows={5} className="font-mono text-xs" /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                try {
                  const fields = JSON.parse(createFields);
                  createMut.mutate(
                    { entity_id: createEntityId, entity_type: createEntityType, fields },
                    { onSuccess: () => { toast.success("Observation created"); setCreateEntityId(""); setCreateEntityType(""); setCreateFields("{}"); } }
                  );
                } catch { toast.error("Invalid JSON in fields"); }
              }}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter by entity ID…" value={entityId} onChange={(e) => { setEntityId(e.target.value); setOffset(0); }} className="pl-9" />
        </div>
        <Input placeholder="Entity type…" value={entityType} onChange={(e) => { setEntityType(e.target.value); setOffset(0); }} className="w-[150px]" />
        <Input placeholder="Source ID…" value={sourceId} onChange={(e) => { setSourceId(e.target.value); setOffset(0); }} className="w-[180px]" />
        <AgentFilterControl />
      </div>

      {showInitialQuerySkeleton(query) ? (
        <DataTableSkeleton rows={12} cols={7} />
      ) : query.error ? (
        <QueryErrorAlert title="Could not load observations">{query.error.message}</QueryErrorAlert>
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={filtersActive ? "No observations match these filters" : "No observations yet"}
          description={
            filtersActive
              ? "Clear or adjust the entity, type, source, or agent filters to see other observations."
              : "Every store and correct call records an observation. Ingest data through chat, MCP, or the CLI to see entries land here."
          }
        />
      ) : (
        <>
          <DataTable columns={columns} data={displayed} />
          {expanded && (
            <div className="rounded-md border p-4 mt-2">
              <JsonViewer data={displayed.find((o) => o.id === expanded)?.fields} defaultExpanded />
            </div>
          )}
          {query.data && query.data.total > PAGE_SIZE && (
            <Pagination offset={offset} limit={PAGE_SIZE} total={query.data.total} onPageChange={setOffset} />
          )}
        </>
      )}
    </PageShell>
  );
}
