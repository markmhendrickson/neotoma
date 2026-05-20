import { useState } from "react";
import { useInterpretations } from "@/hooks/use_interpretations";
import { PageShell } from "@/components/layout/page_shell";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { SourceLink } from "@/components/shared/source_link";
import { AgentBadge } from "@/components/shared/agent_badge";
import { useAgentAttributionFilter } from "@/components/shared/agent_filter";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import type { ColumnDef } from "@tanstack/react-table";
import type { Interpretation } from "@/types/api";

const PAGE_SIZE = 25;

export default function InterpretationsPage() {
  const [sourceId, setSourceId] = useState("");
  const [offset, setOffset] = useState(0);

  const interps = useInterpretations({ source_id: sourceId || undefined, limit: PAGE_SIZE, offset });

  const columns: ColumnDef<Interpretation, unknown>[] = [
    {
      header: "Source",
      accessorKey: "source_id",
      cell: ({ getValue }) => <SourceLink id={getValue() as string} />,
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: ({ getValue }) => {
        const status = getValue() as string | undefined;
        const variant = status === "completed" ? "default" : status === "failed" ? "destructive" : "secondary";
        return <Badge variant={variant}>{status || "unknown"}</Badge>;
      },
    },
    { header: "Observations Created", accessorKey: "observations_created" },
    { header: "Created", accessorKey: "created_at", cell: ({ getValue }) => formatDate(getValue() as string) },
    { header: "Completed", accessorKey: "completed_at", cell: ({ getValue }) => formatDate(getValue() as string) },
    {
      header: "Agent",
      id: "agent",
      cell: ({ row }) => (
        <AgentBadge provenance={row.original.provenance ?? null} />
      ),
    },
  ];

  const items = interps.data?.interpretations ?? [];
  const { filterRows, AgentFilterControl } = useAgentAttributionFilter(items);
  const displayed = filterRows(items);

  return (
    <PageShell
      title="Interpretations"
      description="AI interpretation runs on sources"
      actions={showBackgroundQueryRefresh(interps) ? <QueryRefreshIndicator /> : undefined}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Input placeholder="Filter by source ID…" value={sourceId} onChange={(e) => { setSourceId(e.target.value); setOffset(0); }} className="w-[250px]" />
        <AgentFilterControl />
      </div>

      {showInitialQuerySkeleton(interps) ? (
        <DataTableSkeleton rows={10} cols={6} />
      ) : interps.error ? (
        <QueryErrorAlert title="Could not load interpretations">{interps.error.message}</QueryErrorAlert>
      ) : (
        <>
          <DataTable columns={columns} data={displayed} />
          {interps.data && interps.data.interpretations.length >= PAGE_SIZE && (
            <Pagination offset={offset} limit={PAGE_SIZE} total={interps.data.interpretations.length + offset + 1} onPageChange={setOffset} />
          )}
        </>
      )}
    </PageShell>
  );
}
