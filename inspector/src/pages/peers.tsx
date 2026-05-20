import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePeersList, useRemovePeerMutation } from "@/hooks/use_peers";
import { PageShell } from "@/components/layout/page_shell";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import type { ColumnDef } from "@tanstack/react-table";
import type { PeerConfigRow } from "@/api/endpoints/peers";
import { toast } from "sonner";

function peerActiveVariant(active: boolean, failures: number): "default" | "secondary" | "destructive" | "outline" {
  if (!active) return "destructive";
  if (failures > 0) return "outline";
  return "default";
}

export default function PeersPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = usePeersList();
  const removeMut = useRemovePeerMutation();

  const rows: PeerConfigRow[] = query.data?.peers ?? [];

  const columns: ColumnDef<PeerConfigRow, unknown>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Peer",
        accessorFn: (row) => row.peer_name,
        cell: ({ row }) => (
          <div className="space-y-1">
            <Link
              to={`/peers/${encodeURIComponent(row.original.peer_id)}`}
              className="font-medium text-primary hover:underline"
            >
              {row.original.peer_name}
            </Link>
            <p className="font-mono text-[11px] text-muted-foreground" title={row.original.peer_id}>
              {row.original.peer_id}
            </p>
          </div>
        ),
      },
      {
        id: "url",
        header: "URL",
        accessorKey: "peer_url",
        cell: ({ getValue }) => (
          <span className="max-w-[200px] truncate font-mono text-xs block" title={String(getValue())}>
            {String(getValue())}
          </span>
        ),
      },
      {
        id: "direction",
        header: "Direction",
        cell: ({ row }) => <Badge variant="secondary">{row.original.direction}</Badge>,
      },
      {
        id: "types",
        header: "Entity types",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.entity_types?.join(", ") || "—"}</span>
        ),
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => <span className="text-sm">{row.original.sync_scope}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const active = Boolean(row.original.active);
          const f = row.original.consecutive_failures ?? 0;
          const label = !active ? "inactive" : f > 0 ? "degraded" : "active";
          return <Badge variant={peerActiveVariant(active, f)}>{label}</Badge>;
        },
      },
      {
        id: "last_sync",
        header: "Last sync",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.last_sync_at ?? "—"}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const pid = row.original.peer_id;
          const active = Boolean(row.original.active);
          if (!active) return <span className="text-xs text-muted-foreground">inactive</span>;
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={removeMut.isPending && busyId === pid}
              onClick={() => {
                if (!window.confirm(`Remove peer ${row.original.peer_name} (${pid})?`)) return;
                setBusyId(pid);
                removeMut.mutate(pid, {
                  onSuccess: () => toast.success("Peer removed"),
                  onError: (err) => toast.error(err.message),
                  onSettled: () => setBusyId(null),
                });
              }}
            >
              Remove
            </Button>
          );
        },
      },
    ],
    [busyId, removeMut.isPending],
  );

  return (
    <PageShell
      title="Peers"
      description="Cross-instance Neotoma sync configuration (Phase 5). Shared secrets are never shown after creation."
      actions={showBackgroundQueryRefresh(query) ? <QueryRefreshIndicator label="Refreshing" /> : undefined}
    >
      {showInitialQuerySkeleton(query) ? (
        <DataTableSkeleton />
      ) : query.error ? (
        <QueryErrorAlert title="Could not load peers">{query.error.message}</QueryErrorAlert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Configure peers via MCP <code className="text-xs">add_peer</code> or{" "}
            <code className="text-xs">POST /peers</code>. Inbound sync uses{" "}
            <code className="text-xs">POST /sync/webhook</code> with HMAC verification.
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No peers configured.</p>
          ) : (
            <DataTable columns={columns} data={rows} />
          )}
        </>
      )}
    </PageShell>
  );
}
