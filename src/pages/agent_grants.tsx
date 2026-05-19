/**
 * Agent grants list + creation surface.
 *
 * `agent_grant` entities are how Stronger AAuth Admission models trust:
 * a verified AAuth identity that matches an `active` grant authenticates
 * as the grant's owning user without an OAuth/Bearer token.
 *
 * This page lets you browse, filter, and create grants. Detail/edit and
 * status transitions live on `/agents/grants/:id`.
 */

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Plus } from "lucide-react";
import { PageShell } from "@/components/layout/page_shell";
import type { HeaderSearchContextValue } from "@/components/layout/page_title_context";
import {
  DataTableSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AgentGrantForm } from "@/components/agents/agent_grant_form";
import { formatDate } from "@/lib/utils";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import {
  useAgentGrants,
  useCreateAgentGrant,
} from "@/hooks/use_agents";
import type {
  AgentGrant,
  AgentGrantCreateRequest,
  AgentGrantStatus,
} from "@/types/api";

const STATUS_OPTIONS: ReadonlyArray<{
  value: AgentGrantStatus | "all";
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "all", label: "All" },
  { value: "suspended", label: "Suspended" },
  { value: "revoked", label: "Revoked" },
];

function statusBadgeVariant(
  status: AgentGrantStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "suspended":
      return "secondary";
    case "revoked":
      return "destructive";
    default:
      return "outline";
  }
}

function identitySummary(grant: AgentGrant): string {
  if (grant.match_thumbprint) return `thumb:${grant.match_thumbprint}`;
  if (grant.match_sub && grant.match_iss) {
    return `sub:${grant.match_sub} (iss:${grant.match_iss})`;
  }
  if (grant.match_sub) return `sub:${grant.match_sub}`;
  return "—";
}

function capabilitySummary(grant: AgentGrant): string {
  if (!grant.capabilities.length) return "0 ops";
  return grant.capabilities.map((c) => c.op).join(", ");
}

export default function AgentGrantsPage() {
  const [params] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<AgentGrantStatus | "all">(
    () => {
      const v = params.get("status");
      if (v === "active" || v === "suspended" || v === "revoked" || v === "all") {
        return v;
      }
      return "active";
    },
  );
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const grantsQ = useAgentGrants({
    status: statusFilter,
    q: query.trim() || undefined,
  });
  const createMutation = useCreateAgentGrant();

  // Derive identity hint for the create dialog from query string. The
  // `/agents/:key` page links here with `?promote=1&sub=...&thumb=...`
  // so creating a grant from an observed identity is a one-click flow.
  const promoteHint = useMemo(() => {
    const promote = params.get("promote");
    if (promote !== "1" && promote !== "true") return null;
    return {
      sub: params.get("sub"),
      iss: params.get("iss"),
      thumbprint: params.get("thumbprint"),
      label: params.get("label"),
    };
  }, [params]);

  const grants = grantsQ.data?.grants ?? [];

  const headerSearch = useMemo<HeaderSearchContextValue>(
    () => ({
      value: query,
      onValueChange: (nextSearch) => {
        setQuery(nextSearch);
      },
      placeholder: "Search by label, subject, thumbprint…",
      ariaLabel: "Search agent grants",
    }),
    [query],
  );

  const columns: ColumnDef<AgentGrant, unknown>[] = [
    {
      header: "Label",
      accessorKey: "label",
      cell: ({ row }) => (
        <Link
          to={`/agents/grants/${encodeURIComponent(row.original.grant_id)}`}
          className="font-medium text-foreground hover:underline"
        >
          {row.original.label}
        </Link>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant={statusBadgeVariant(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      header: "Identity",
      id: "identity",
      cell: ({ row }) => (
        <span className="break-all font-mono text-xs">
          {identitySummary(row.original)}
        </span>
      ),
    },
    {
      header: "Capabilities",
      id: "capabilities",
      cell: ({ row }) => capabilitySummary(row.original),
    },
    {
      header: "Last used",
      accessorKey: "last_used_at",
      cell: ({ getValue }) => formatDate((getValue() as string | null) ?? undefined),
    },
    {
      header: "Source",
      accessorKey: "import_source",
      cell: ({ getValue }) => {
        const v = getValue() as string | null | undefined;
        return v ? <Badge variant="outline">{v}</Badge> : "—";
      },
    },
  ];

  async function handleCreate(payload: AgentGrantCreateRequest) {
    setCreateError(null);
    try {
      await createMutation.mutateAsync(payload);
      setCreateOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create grant";
      setCreateError(message);
    }
  }

  // Open the create dialog automatically when arriving with ?promote=1 so
  // the promote-from-observed flow doesn't need a second click.
  if (promoteHint && !createOpen && !createMutation.isSuccess) {
    setCreateOpen(true);
  }

  return (
    <PageShell
      title="Agent grants"
      description={
        <span>
          First-class records that admit a verified AAuth identity as the
          grant's owning user. Every grant is its own entity (entity_type{" "}
          <code className="font-mono">agent_grant</code>) so observation
          history doubles as the audit log.
        </span>
      }
      search={headerSearch}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showBackgroundQueryRefresh(grantsQ) ? <QueryRefreshIndicator /> : null}
          <Button asChild variant="ghost" size="sm">
            <Link to="/agents">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Agents
            </Link>
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                New grant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create agent grant</DialogTitle>
                <DialogDescription>
                  Admit one AAuth identity as your user with the listed
                  capabilities.
                </DialogDescription>
              </DialogHeader>
              <AgentGrantForm
                identityHint={promoteHint ?? undefined}
                submitLabel="Create grant"
                isSubmitting={createMutation.isPending}
                errorMessage={createError}
                showCancel
                onCancel={() => setCreateOpen(false)}
                onSubmit={(payload) =>
                  handleCreate(payload as AgentGrantCreateRequest)
                }
              />
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as AgentGrantStatus | "all")
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {grantsQ.data && (
          <p className="text-sm text-muted-foreground">
            {grants.length} grant{grants.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {showInitialQuerySkeleton(grantsQ) ? (
        <DataTableSkeleton rows={8} cols={6} />
      ) : grantsQ.error ? (
        <QueryErrorAlert title="Could not load agent grants">
          {grantsQ.error.message}
        </QueryErrorAlert>
      ) : (
        <DataTable columns={columns} data={grants} />
      )}
    </PageShell>
  );
}
