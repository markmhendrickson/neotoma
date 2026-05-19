import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useSchemas } from "@/hooks/use_schemas";
import { useAgentGrants } from "@/hooks/use_agents";
import { useRegisterSchema } from "@/hooks/use_mutations";
import { PageShell } from "@/components/layout/page_shell";
import type { HeaderSearchContextValue } from "@/components/layout/page_title_context";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { OffsetPagination } from "@/components/ui/pagination";
import { TypeBadge } from "@/components/shared/type_badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { EntitySchema } from "@/types/api";
import { grantsForEntityType } from "@/lib/agent_grant_key";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export default function SchemasPage() {
  const schemas = useSchemas();
  const grantsQ = useAgentGrants({ status: "all" });
  const registerMut = useRegisterSchema();

  const [regType, setRegType] = useState("");
  const [regDef, setRegDef] = useState('{\n  "fields": {}\n}');
  const [regReducer, setRegReducer] = useState('{\n  "merge_policies": {}\n}');
  const [searchQuery, setSearchQuery] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);

  const allSchemas = schemas.data?.schemas ?? [];

  const filteredSchemas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allSchemas;
    return allSchemas.filter((s) => {
      const type = s.entity_type.toLowerCase();
      const ver = String(s.schema_version ?? "").toLowerCase();
      const fields = (s.field_names ?? []).join(" ").toLowerCase();
      return type.includes(q) || ver.includes(q) || fields.includes(q);
    });
  }, [allSchemas, searchQuery]);

  useEffect(() => {
    setPageOffset(0);
  }, [searchQuery]);

  useEffect(() => {
    setPageOffset((prev) => {
      if (filteredSchemas.length === 0) return 0;
      const maxOffset = Math.max(0, Math.ceil(filteredSchemas.length / pageSize) * pageSize - pageSize);
      return Math.min(prev, maxOffset);
    });
  }, [filteredSchemas.length, pageSize]);

  const pageRows = useMemo(
    () => filteredSchemas.slice(pageOffset, pageOffset + pageSize),
    [filteredSchemas, pageOffset, pageSize],
  );

  const grantCountByType = useMemo(() => {
    const list = schemas.data?.schemas ?? [];
    const grants = grantsQ.data?.grants ?? [];
    const m = new Map<string, number>();
    for (const s of list) {
      m.set(s.entity_type, grantsForEntityType(grants, s.entity_type).length);
    }
    return m;
  }, [schemas.data?.schemas, grantsQ.data?.grants]);

  const columns: ColumnDef<EntitySchema, unknown>[] = useMemo(
    () => [
    {
      header: "Entity Type",
      accessorKey: "entity_type",
      cell: ({ row }) => (
        <Link to={`/schemas/${encodeURIComponent(row.original.entity_type)}`} className="font-medium text-primary hover:underline">
          <TypeBadge type={row.original.entity_type} />
        </Link>
      ),
    },
    { header: "Version", accessorKey: "schema_version" },
    {
      header: "Fields",
      accessorKey: "field_names",
      cell: ({ getValue }) => {
        const names = getValue() as string[] | undefined;
        return names ? names.length : "—";
      },
    },
    {
      header: "Active",
      accessorKey: "active",
      cell: ({ getValue }) => (getValue() !== false ? "Yes" : "No"),
    },
    {
      header: () => (
        <span className="block max-w-[5rem] leading-tight">
          Grants
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            Admission
          </span>
        </span>
      ),
      id: "admission_grants",
      cell: ({ row }) => {
        const et = row.original.entity_type;
        const n = grantCountByType.get(et) ?? 0;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-muted-foreground">{n}</span>
            {n > 0 ? (
              <Link
                to={`/schemas/${encodeURIComponent(et)}#admission-grants`}
                className="text-xs text-primary hover:underline"
              >
                View
              </Link>
            ) : null}
          </div>
        );
      },
    },
    ],
    [grantCountByType],
  );

  const headerMeta = useMemo(() => {
    if (!schemas.data) return undefined;
    const total = schemas.data.total ?? schemas.data.schemas.length;
    const q = searchQuery.trim();
    if (q && filteredSchemas.length !== total) {
      return `${filteredSchemas.length.toLocaleString()} of ${total.toLocaleString()} match`;
    }
    if (q && filteredSchemas.length === total) {
      return `${total.toLocaleString()} match`;
    }
    return `${total.toLocaleString()} registered`;
  }, [schemas.data, searchQuery, filteredSchemas.length]);

  const headerSearch = useMemo<HeaderSearchContextValue>(
    () => ({
      value: searchQuery,
      onValueChange: (nextSearch) => {
        setSearchQuery(nextSearch);
      },
      placeholder: "Search entity type, version, field name…",
      ariaLabel: "Filter schemas",
    }),
    [searchQuery],
  );

  return (
    <PageShell
      title="Schemas"
      meta={headerMeta}
      description="Admission grants column counts agent_grant capabilities that list each entity_type (or *)."
      search={headerSearch}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {showBackgroundQueryRefresh(schemas) || showBackgroundQueryRefresh(grantsQ) ? (
            <QueryRefreshIndicator />
          ) : null}
          <Dialog>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-3 w-3 mr-1" /> Register</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Register Schema</DialogTitle><DialogDescription>Register a new entity type schema.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Entity Type</Label><Input value={regType} onChange={(e) => setRegType(e.target.value)} placeholder="my_entity_type" /></div>
              <div><Label>Schema Definition (JSON)</Label><Textarea value={regDef} onChange={(e) => setRegDef(e.target.value)} rows={6} className="font-mono text-xs" /></div>
              <div><Label>Reducer Config (JSON)</Label><Textarea value={regReducer} onChange={(e) => setRegReducer(e.target.value)} rows={4} className="font-mono text-xs" /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                try {
                  registerMut.mutate(
                    { entity_type: regType, schema_definition: JSON.parse(regDef), reducer_config: JSON.parse(regReducer), activate: true },
                    { onSuccess: () => { toast.success("Schema registered"); setRegType(""); } }
                  );
                } catch { toast.error("Invalid JSON"); }
              }}>Register</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      }
    >
      {showInitialQuerySkeleton(schemas) ? (
        <DataTableSkeleton rows={8} cols={5} />
      ) : schemas.error ? (
        <QueryErrorAlert title="Could not load schemas">{schemas.error.message}</QueryErrorAlert>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-end gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Rows per page</span>
              <div className="flex rounded-md border border-border p-0.5">
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={pageSize === n ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setPageSize(n);
                      setPageOffset(0);
                    }}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={pageRows}
            emptyLabel={
              searchQuery.trim()
                ? "No schemas match the current filter."
                : "No registered schemas."
            }
          />
          {filteredSchemas.length > 0 ? (
            <OffsetPagination
              offset={pageOffset}
              limit={pageSize}
              total={filteredSchemas.length}
              onPageChange={setPageOffset}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
