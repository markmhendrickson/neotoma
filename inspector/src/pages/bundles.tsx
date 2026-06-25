/**
 * Bundles directory (Bundles m4 surfacing).
 *
 * Read-only view of the bundle registry served by `GET /bundles`. Each row
 * shows a bundle's name, type, version, enable/always-active state, the count
 * of entity types it provides, and the use cases it serves. Clicking a row
 * opens a detail dialog backed by `GET /bundles/:name` showing the full
 * manifest.
 *
 * Enable/disable controls are intentionally absent: those mutations need the
 * AAuth admin gate deferred from m3 and are not exposed over HTTP yet.
 *
 * Plan ent_089da2ecebc3bd804d63dcf2 (Bundles Strategy).
 */

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageShell } from "@/components/layout/page_shell";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { useBundle, useBundles } from "@/hooks/use_bundles";
import type { BundleListEntry } from "@/types/api";

function StatusBadge({ bundle }: { bundle: Pick<BundleListEntry, "enabled" | "always_active"> }) {
  if (bundle.always_active) {
    return <Badge variant="default">Always active</Badge>;
  }
  return bundle.enabled ? (
    <Badge variant="secondary">Enabled</Badge>
  ) : (
    <Badge variant="outline">Disabled</Badge>
  );
}

function UseCasesCell({ useCases }: { useCases: string[] | undefined }) {
  const list = useCases ?? [];
  if (list.length === 0) {
    return <span className="text-xs text-muted-foreground">(none)</span>;
  }
  const shown = list.slice(0, 4);
  const rest = list.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((u) => (
        <Badge key={u} variant="outline" className="text-xs font-normal">
          {u}
        </Badge>
      ))}
      {rest > 0 ? <span className="text-xs text-muted-foreground">+{rest} more</span> : null}
    </div>
  );
}

function BundleDetailDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  const q = useBundle(name ?? undefined);
  const info = q.data;
  return (
    <Dialog open={Boolean(name)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{name}</DialogTitle>
          <DialogDescription>{info?.manifest.description ?? "Bundle manifest"}</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading manifest…</p>
        ) : q.error ? (
          <QueryErrorAlert title="Could not load bundle">{q.error.message}</QueryErrorAlert>
        ) : info ? (
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Type</dt>
            <dd>
              <Badge variant="secondary">{info.manifest.bundle_type}</Badge>
            </dd>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{info.manifest.version}</dd>
            <dt className="text-muted-foreground">State</dt>
            <dd>
              <StatusBadge bundle={{ enabled: info.enabled, always_active: info.always_active }} />
            </dd>
            {info.manifest.category ? (
              <>
                <dt className="text-muted-foreground">Category</dt>
                <dd>{info.manifest.category}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Compatible modes</dt>
            <dd>{info.manifest.compatible_modes.join(", ") || "(all)"}</dd>
            <dt className="text-muted-foreground">Requires bundles</dt>
            <dd>{info.manifest.requires_bundles.join(", ") || "(none)"}</dd>
            <dt className="text-muted-foreground">Provides entity types</dt>
            <dd className="font-mono text-xs">
              {info.manifest.provides_entity_types.join(", ") || "(none)"}
            </dd>
            <dt className="text-muted-foreground">References shared schemas</dt>
            <dd className="font-mono text-xs">
              {info.manifest.references_shared_schemas.join(", ") || "(none)"}
            </dd>
            <dt className="text-muted-foreground">Extends schemas</dt>
            <dd className="font-mono text-xs">
              {info.manifest.extends_schemas.join(", ") || "(none)"}
            </dd>
            <dt className="text-muted-foreground">Provides skills</dt>
            <dd className="font-mono text-xs">
              {info.manifest.provides_skills.length > 0
                ? info.manifest.provides_skills.map((s) => s.name).join(", ")
                : "(none)"}
            </dd>
            <dt className="text-muted-foreground">Serves use cases</dt>
            <dd>
              <UseCasesCell useCases={info.manifest.serves_use_cases} />
            </dd>
          </dl>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function BundlesPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const bundlesQ = useBundles();

  const filtered = useMemo(() => {
    const items = bundlesQ.data?.bundles ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((b) => {
      const tokens = [b.name, b.bundle_type, b.version, ...(b.serves_use_cases ?? [])].filter(
        Boolean
      ) as string[];
      return tokens.some((v) => v.toLowerCase().includes(q));
    });
  }, [bundlesQ.data, query]);

  const columns: ColumnDef<BundleListEntry, unknown>[] = [
    {
      header: "Bundle",
      accessorKey: "name",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setSelected(row.original.name)}
          className="font-medium text-foreground hover:underline"
        >
          {row.original.name}
        </button>
      ),
    },
    {
      header: "Type",
      accessorKey: "bundle_type",
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        return v ? <Badge variant="secondary">{v}</Badge> : <span>—</span>;
      },
    },
    {
      header: "Version",
      accessorKey: "version",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs">{(getValue() as string) ?? "—"}</span>
      ),
    },
    {
      header: "State",
      id: "state",
      cell: ({ row }) => <StatusBadge bundle={row.original} />,
    },
    {
      header: () => (
        <span className="block leading-tight">
          Entity types
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            Provided
          </span>
        </span>
      ),
      id: "entity_types",
      cell: ({ row }) => String(row.original.provides_entity_types_count ?? 0),
    },
    {
      header: "Serves use cases",
      id: "serves_use_cases",
      cell: ({ row }) => <UseCasesCell useCases={row.original.serves_use_cases} />,
    },
  ];

  return (
    <PageShell
      title="Bundles"
      description="The deliverable units Neotoma ships: schemas, record-type docs, and skills. Read-only directory of the installed bundle registry. Enable/disable controls are not yet exposed (they need the AAuth admin gate)."
      actions={showBackgroundQueryRefresh(bundlesQ) ? <QueryRefreshIndicator /> : undefined}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search by name, type, use case…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-[320px]"
        />
        {bundlesQ.data && (
          <p className="text-sm text-muted-foreground">
            {bundlesQ.data.bundles.length} bundle
            {bundlesQ.data.bundles.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {showInitialQuerySkeleton(bundlesQ) ? (
        <DataTableSkeleton rows={6} cols={6} />
      ) : bundlesQ.error ? (
        <QueryErrorAlert title="Could not load bundles">{bundlesQ.error.message}</QueryErrorAlert>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      <BundleDetailDialog name={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
