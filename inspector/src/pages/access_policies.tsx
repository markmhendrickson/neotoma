import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isApiUrlConfigured, MISSING_API_URL_MESSAGE } from "@/api/client";
import { PageShell } from "@/components/layout/page_shell";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { useAccessPolicies } from "@/hooks/use_access_policies";
import { useEntitiesQuery } from "@/hooks/use_entities";
import type { EntitySnapshot } from "@/types/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { TypeBadge } from "@/components/shared/type_badge";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

interface PolicyRow {
  entity_type: string;
  mode: string;
}

function modeBadgeVariant(mode: string): "default" | "secondary" | "destructive" | "outline" {
  switch (mode) {
    case "closed":
      return "secondary";
    case "open":
      return "destructive";
    default:
      return "default";
  }
}

interface SubmissionConfigRow {
  entity_id: string;
  config_key: string;
  target_entity_type: string;
  access_policy: string;
  active: boolean;
}

function submissionSnap(row: EntitySnapshot): Record<string, unknown> {
  const s = row.snapshot;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : {};
}

function rowEntityId(row: EntitySnapshot): string {
  return row.entity_id ?? row.id ?? "";
}

const columns: ColumnDef<PolicyRow>[] = [
  {
    accessorKey: "entity_type",
    header: "Entity Type",
    cell: ({ row }) => (
      <Link
        to={`/schemas/${encodeURIComponent(row.original.entity_type)}`}
        className="hover:underline"
      >
        <TypeBadge type={row.original.entity_type} />
      </Link>
    ),
  },
  {
    accessorKey: "mode",
    header: "Guest Access Policy",
    cell: ({ row }) => (
      <Badge variant={modeBadgeVariant(row.original.mode)}>
        {row.original.mode}
      </Badge>
    ),
  },
];

const submissionColumns: ColumnDef<SubmissionConfigRow, unknown>[] = [
  {
    id: "config_key",
    header: "Config",
    accessorKey: "config_key",
    cell: ({ row }) => (
      <Link
        to={`/entities/${encodeURIComponent(row.original.entity_id)}`}
        className="font-medium text-primary hover:underline"
      >
        {row.original.config_key}
      </Link>
    ),
  },
  {
    accessorKey: "target_entity_type",
    header: "Target type",
    cell: ({ row }) => (
      <Link
        to={`/schemas/${encodeURIComponent(row.original.target_entity_type)}`}
        className="hover:underline"
      >
        <TypeBadge type={row.original.target_entity_type} />
      </Link>
    ),
  },
  {
    accessorKey: "access_policy",
    header: "Access policy",
    cell: ({ row }) => (
      <Badge variant={modeBadgeVariant(row.original.access_policy)}>{row.original.access_policy}</Badge>
    ),
  },
  {
    accessorKey: "active",
    header: "Active",
    cell: ({ row }) => (
      <Badge variant={row.original.active ? "default" : "secondary"}>
        {row.original.active ? "yes" : "no"}
      </Badge>
    ),
  },
];

export default function AccessPoliciesPage() {
  const [query, setQuery] = useState("");
  const policiesQ = useAccessPolicies();
  const submissionConfigsQ = useEntitiesQuery({
    entity_type: "submission_config",
    limit: 100,
    offset: 0,
    include_snapshots: true,
  });

  const rows: PolicyRow[] = useMemo(() => {
    if (!policiesQ.data?.policies) return [];
    return Object.entries(policiesQ.data.policies)
      .map(([entity_type, mode]) => ({ entity_type, mode }))
      .sort((a, b) => a.entity_type.localeCompare(b.entity_type));
  }, [policiesQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.entity_type.toLowerCase().includes(q) ||
        r.mode.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const defaultMode = policiesQ.data?.default_mode ?? "closed";

  const submissionRows: SubmissionConfigRow[] = useMemo(() => {
    const list = submissionConfigsQ.data?.entities ?? [];
    return list.map((row) => {
      const snap = submissionSnap(row);
      return {
        entity_id: rowEntityId(row),
        config_key: String(snap.config_key ?? rowEntityId(row)),
        target_entity_type: String(snap.target_entity_type ?? ""),
        access_policy: String(snap.access_policy ?? ""),
        active: Boolean(snap.active),
      };
    });
  }, [submissionConfigsQ.data?.entities]);

  if (!isApiUrlConfigured()) {
    return (
      <PageShell
        title="Guest Access Policies"
        description="API not configured — this page cannot load until the Inspector knows which Neotoma API to call."
      >
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-muted-foreground">{MISSING_API_URL_MESSAGE}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="default" size="sm">
                <a href="/?from=inspector" rel="noopener">
                  Start a sandbox session
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings">Open Settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (showInitialQuerySkeleton(policiesQ))
    return (
      <PageShell title="Access Policies">
        <DataTableSkeleton />
      </PageShell>
    );
  if (policiesQ.error)
    return (
      <PageShell title="Guest Access Policies">
        <QueryErrorAlert title="Could not load access policies">
          {policiesQ.error.message}
        </QueryErrorAlert>
        <p className="mt-3 text-sm text-muted-foreground">
          <code className="text-xs">GET /access_policies</code> requires an authenticated session.
          Open <Link className="underline" to="/settings">Settings</Link> and sign in, or use a
          sandbox handoff so the Inspector stores a bearer token.
        </p>
      </PageShell>
    );

  return (
    <PageShell
      title="Guest Access Policies"
      description="Controls what AAuth-verified guests (not admitted via agent grants) can do with each entity type."
      actions={
        showBackgroundQueryRefresh(policiesQ) || showBackgroundQueryRefresh(submissionConfigsQ) ? (
          <QueryRefreshIndicator />
        ) : null
      }
    >
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Default Policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Entity types not listed below default to{" "}
            <Badge variant="secondary">{defaultMode}</Badge>. Manage policies
            via the CLI:{" "}
            <code className="text-xs">neotoma access set &lt;type&gt; &lt;mode&gt;</code>
          </p>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            No entity types currently resolve to a non-default guest access policy (everything
            behaves as <Badge variant="secondary">{defaultMode}</Badge> unless overridden by env or
            schema metadata).
          </p>
          <p>
            If this list should show types such as <code className="text-xs">issue</code>, ensure
            you are signed in (Settings), the API is reachable, and schemas are seeded. Use{" "}
            <code className="text-xs">neotoma access enable-issues</code> or{" "}
            <code className="text-xs">neotoma access list</code> on the server to confirm.
          </p>
        </div>
      ) : (
        <>
          <Input
            placeholder="Filter by entity type or mode…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm mb-4"
          />
          <DataTable columns={columns} data={filtered} />
        </>
      )}

      <Card className="mt-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Submission configs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Operator-defined <code className="text-xs">submission_config</code> rows control generic{" "}
            <code className="text-xs">submit_entity</code> / <code className="text-xs">POST /submit/:entity_type</code>{" "}
            pipelines and their guest <code className="text-xs">access_policy</code> (orthogonal to the per-type
            guest access table above).
          </p>
          {showInitialQuerySkeleton(submissionConfigsQ) ? (
            <DataTableSkeleton />
          ) : submissionConfigsQ.error ? (
            <QueryErrorAlert title="Could not load submission configs">
              {submissionConfigsQ.error.message}
            </QueryErrorAlert>
          ) : submissionRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submission_config entities in this workspace.</p>
          ) : (
            <DataTable columns={submissionColumns} data={submissionRows} />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
