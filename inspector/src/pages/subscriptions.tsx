import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useEntitiesQuery } from "@/hooks/use_entities";
import { useUnsubscribeMutation } from "@/hooks/use_subscriptions";
import { PageShell } from "@/components/layout/page_shell";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { truncateId } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { EntitySnapshot } from "@/types/api";
import { toast } from "sonner";

function rowEntityId(row: EntitySnapshot): string {
  return row.entity_id ?? row.id ?? "";
}

function snap(row: EntitySnapshot): Record<string, unknown> {
  const s = row.snapshot;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : {};
}

function subscriptionStatusVariant(
  active: boolean,
  failures: number,
): "default" | "secondary" | "destructive" | "outline" {
  if (!active) return "destructive";
  if (failures > 0) return "outline";
  return "default";
}

export default function SubscriptionsPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const unsub = useUnsubscribeMutation();

  const query = useEntitiesQuery({
    entity_type: "subscription",
    limit: 100,
    offset: 0,
    sort_by: "last_observation_at",
    sort_order: "desc",
    include_snapshots: true,
  });

  const rows = query.data?.entities ?? [];

  const columns: ColumnDef<EntitySnapshot, unknown>[] = useMemo(
    () => [
      {
        id: "subscription_id",
        header: "Subscription",
        accessorFn: (row) => String(snap(row).subscription_id ?? rowEntityId(row)),
        cell: ({ row }) => {
          const s = snap(row.original);
          const sid = String(s.subscription_id ?? "");
          const eid = rowEntityId(row.original);
          return (
            <div className="space-y-1">
              <Link to={`/entities/${encodeURIComponent(eid)}`} className="font-medium text-primary hover:underline">
                {sid ? truncateId(sid, 16) : truncateId(eid, 12)}
              </Link>
              {sid ? (
                <p className="font-mono text-[11px] text-muted-foreground" title={sid}>
                  {sid}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "delivery",
        header: "Delivery",
        accessorFn: (row) => String(snap(row).delivery_method ?? "—"),
        cell: ({ row }) => {
          const s = snap(row.original);
          return <Badge variant="secondary">{String(s.delivery_method ?? "—")}</Badge>;
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = snap(row.original);
          const active = Boolean(s.active);
          const failures = typeof s.consecutive_failures === "number" ? s.consecutive_failures : 0;
          const label = !active ? "inactive" : failures > 0 ? "degraded" : "active";
          return (
            <Badge variant={subscriptionStatusVariant(active, failures)}>{label}</Badge>
          );
        },
      },
      {
        id: "filters",
        header: "Watches",
        cell: ({ row }) => {
          const s = snap(row.original);
          const types = Array.isArray(s.watch_entity_types) ? (s.watch_entity_types as string[]) : [];
          const ids = Array.isArray(s.watch_entity_ids) ? (s.watch_entity_ids as string[]) : [];
          const evts = Array.isArray(s.watch_event_types) ? (s.watch_event_types as string[]) : [];
          const parts: string[] = [];
          if (types.length) parts.push(`${types.length} type(s)`);
          if (ids.length) parts.push(`${ids.length} id(s)`);
          if (evts.length) parts.push(`${evts.length} event(s)`);
          return <span className="text-sm text-muted-foreground">{parts.length ? parts.join(" · ") : "—"}</span>;
        },
      },
      {
        id: "webhook",
        header: "Webhook / sync",
        cell: ({ row }) => {
          const s = snap(row.original);
          const url = typeof s.webhook_url === "string" ? s.webhook_url : "";
          const peer = typeof s.sync_peer_id === "string" ? s.sync_peer_id : "";
          return (
            <div className="max-w-[240px] space-y-1 text-xs text-muted-foreground">
              {url ? (
                <p className="truncate font-mono" title={url}>
                  {url}
                </p>
              ) : (
                <p>—</p>
              )}
              {peer ? (
                <p className="truncate" title={peer}>
                  loop skip: <span className="font-mono">{truncateId(peer, 20)}</span>
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "failures",
        header: "Failures",
        accessorFn: (row) => snap(row).consecutive_failures ?? 0,
        cell: ({ getValue }) => String(getValue()),
      },
      {
        id: "last_delivered",
        header: "Last delivered",
        accessorFn: (row) => String(snap(row).last_delivered_at ?? "—"),
        cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const s = snap(row.original);
          const subscriptionId = String(s.subscription_id ?? "");
          const active = Boolean(s.active);
          if (!subscriptionId || !active) {
            return active ? null : <span className="text-xs text-muted-foreground">inactive</span>;
          }
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={unsub.isPending && busyId === subscriptionId}
              onClick={() => {
                if (!window.confirm(`Deactivate subscription ${subscriptionId}?`)) return;
                setBusyId(subscriptionId);
                unsub.mutate(subscriptionId, {
                  onSuccess: () => toast.success("Subscription deactivated"),
                  onError: (err) => toast.error(err.message),
                  onSettled: () => setBusyId(null),
                });
              }}
            >
              Unsubscribe
            </Button>
          );
        },
      },
    ],
    [busyId, unsub.isPending],
  );

  return (
    <PageShell
      title="Subscriptions"
      description="Substrate event subscriptions (webhook or SSE). Secrets are redacted after creation."
      actions={showBackgroundQueryRefresh(query) ? <QueryRefreshIndicator label="Refreshing" /> : undefined}
    >
      {showInitialQuerySkeleton(query) ? (
        <DataTableSkeleton />
      ) : query.error ? (
        <QueryErrorAlert title="Could not load subscriptions">{query.error.message}</QueryErrorAlert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Rows are <code className="text-xs">subscription</code> entities. Create subscriptions via MCP{" "}
            <code className="text-xs">subscribe</code> or <code className="text-xs">POST /subscribe</code>.
          </p>
          <DataTable columns={columns} data={rows} />
        </>
      )}
    </PageShell>
  );
}
