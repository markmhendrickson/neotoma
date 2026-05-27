import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEntitiesQuery } from "@/hooks/use_entities";
import { useAgentGrants } from "@/hooks/use_agents";
import { PageShell } from "@/components/layout/page_shell";
import type { HeaderSearchContextValue } from "@/components/layout/page_title_context";
import { DataTableSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { DataTable } from "@/components/ui/data-table";
import { TypeBadge } from "@/components/shared/type_badge";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate, truncateId } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { EntitySnapshot, SnapshotFilter } from "@/types/api";
import { EntityListAdmissionCell } from "@/components/shared/entity_list_admission_cell";
import { EntityTypeSelect } from "@/components/shared/entity_type_select";
import { EntityTableColumnToggle } from "@/components/shared/entity_table_column_toggle";
import { InlineEditCell } from "@/components/shared/inline_edit_cell";
import { PinPrimitiveButton } from "@/components/shared/pin_primitive_button";
import { entityTypeFilterPinHref } from "@/lib/pinned_primitives";
import { entityTypeListPath, pluralizeEntityTypeLabel } from "@/lib/entity_type_labels";
import { humanizeKey } from "@/lib/humanize";
import { useSchemaByType, useSchemas } from "@/hooks/use_schemas";
import {
  buildEntitiesListColumnConfig,
  buildVisibleEntitySortOptions,
  DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY,
  schemaFieldKeys,
  snapshotFieldColumnId,
} from "@/lib/entity_table_columns";
import type { EntitySchema } from "@/types/api";
import type { VisibilityState } from "@tanstack/react-table";
import { EntityFieldFilterBar } from "@/components/shared/entity_field_filter_bar";
import { BulkActionBar } from "@/components/shared/bulk_action_bar";
import { EntityBoardView } from "@/components/shared/entity_board_view";
import { CreateEntityDialog } from "@/components/shared/create_entity_dialog";
import { getSavedViews, saveView, generateViewId, type SavedView } from "@/lib/saved_views";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, LayoutGrid, List, Plus, Save } from "lucide-react";

const PAGE_SIZE = 25;

function entityRowId(row: EntitySnapshot): string {
  return row.entity_id ?? row.id ?? "";
}

export default function EntitiesPage({ typeSlug }: { typeSlug?: string } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = typeSlug?.trim() || searchParams.get("type") || "";
  const initialSearch = searchParams.get("search") || "";
  const [search, setSearch] = useState(initialSearch);
  const [entityType, setEntityType] = useState(initialType);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState("last_observation_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [identityBasis, setIdentityBasis] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    DEFAULT_ENTITIES_LIST_COLUMN_VISIBILITY,
  );
  const [snapshotFilters, setSnapshotFilters] = useState<Record<string, SnapshotFilter>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [boardGroupField, setBoardGroupField] = useState<string>("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const grantsQ = useAgentGrants({ status: "all" });
  const schemasQ = useSchemas();
  const schemaQ = useSchemaByType(entityType || undefined);
  const admissionGrants = grantsQ.data?.grants ?? [];

  const listColumnConfig = useMemo(
    () => buildEntitiesListColumnConfig(entityType ? schemaQ.data : null),
    [entityType, schemaQ.data],
  );

  const visibleSortOptions = useMemo(
    () =>
      buildVisibleEntitySortOptions(
        listColumnConfig.columnIds,
        columnVisibility,
        listColumnConfig.columnLabels,
      ),
    [listColumnConfig.columnIds, listColumnConfig.columnLabels, columnVisibility],
  );

  const schemaFields = useMemo(() => schemaFieldKeys(schemaQ.data), [schemaQ.data]);

  const categoricalFields = useMemo(() => {
    if (!schemaQ.data) return [];
    const fields = schemaQ.data.schema_definition?.fields ?? {};
    return Object.entries(fields)
      .filter(([, def]) => {
        const d = def as { type?: string };
        return d.type === "string" || d.type === "enum";
      })
      .map(([k]) => k);
  }, [schemaQ.data]);

  // Saved views
  const savedViews = useMemo(
    () => (entityType ? getSavedViews(entityType) : []),
    [entityType, viewMode, sortBy, sortOrder],
  );

  useEffect(() => {
    if (search || visibleSortOptions.length === 0) return;
    const allowed = new Set(visibleSortOptions.map((o) => o.value));
    if (!allowed.has(sortBy)) {
      setSortBy(visibleSortOptions[0]?.value ?? "last_observation_at");
    }
  }, [search, sortBy, visibleSortOptions]);

  const schemaLabelByType = useMemo(() => {
    const map = new Map<string, string>();
    for (const schema of schemasQ.data?.schemas ?? []) {
      const label =
        schema.metadata && typeof schema.metadata === "object"
          ? (schema.metadata as Record<string, unknown>).label
          : undefined;
      if (typeof label === "string" && label.trim()) {
        map.set(schema.entity_type, label.trim());
      }
    }
    return map;
  }, [schemasQ.data?.schemas]);

  useEffect(() => {
    setSearch(initialSearch);
    setOffset(0);
  }, [initialSearch]);

  useEffect(() => {
    setEntityType(initialType);
    setOffset(0);
    setSnapshotFilters({});
    setRowSelection({});
    setBoardGroupField("");
  }, [initialType]);

  useEffect(() => {
    setColumnVisibility(buildEntitiesListColumnConfig(entityType ? schemaQ.data : null).defaultVisibility);
  }, [entityType, schemaQ.data]);

  const pluralTypeTitle = useMemo(() => {
    if (!entityType) return null;
    return pluralizeEntityTypeLabel(entityType, schemaLabelByType.get(entityType));
  }, [entityType, schemaLabelByType]);

  function navigateForEntityType(nextType: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("type");
    const search = params.toString();
    if (nextType) {
      navigate({
        pathname: entityTypeListPath(nextType),
        search: search ? `?${search}` : "",
      });
      return;
    }
    navigate({
      pathname: "/entities",
      search: search ? `?${search}` : "",
    });
  }

  const activeSnapshotFilters = useMemo(() => {
    if (Object.keys(snapshotFilters).length === 0) return undefined;
    return snapshotFilters;
  }, [snapshotFilters]);

  const query = useEntitiesQuery({
    search: search || undefined,
    entity_type: entityType || undefined,
    limit: PAGE_SIZE,
    offset,
    sort_by: search ? undefined : sortBy,
    sort_order: search ? undefined : sortOrder,
    include_snapshots: true,
    identity_basis:
      (identityBasis as
        | "schema_rule"
        | "schema_lookup"
        | "heuristic_name"
        | "heuristic_fallback"
        | "target_id") || undefined,
    snapshot_filters: activeSnapshotFilters,
  });

  const selectedEntities = useMemo(() => {
    const entities = query.data?.entities ?? [];
    return Object.keys(rowSelection)
      .filter((k) => rowSelection[k])
      .map((id) => entities.find((e) => entityRowId(e) === id))
      .filter(Boolean) as EntitySnapshot[];
  }, [rowSelection, query.data?.entities]);

  const headerSearch = useMemo<HeaderSearchContextValue>(
    () => ({
      value: search,
      onValueChange: (nextSearch) => {
        setSearch(nextSearch);
        setOffset(0);
      },
      onSubmit: () => setOffset(0),
      placeholder: "Search entities...",
      ariaLabel: "Search entities",
      contextLabel: pluralTypeTitle ? `Top ${pluralTypeTitle.toLowerCase()}` : "Top entity matches",
      suggestions: (query.data?.entities ?? []).slice(0, 4).map((entity) => {
        const eid = entityRowId(entity);
        const label = String(
          entity.canonical_name || entity.snapshot?.name || entity.snapshot?.title || truncateId(eid),
        );

        return {
          id: eid,
          label,
          to: `/entities/${encodeURIComponent(eid)}`,
          meta: (
            <>
              <TypeBadge type={entity.entity_type} humanize className="max-w-[9rem] truncate" />
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {truncateId(eid, 12)}
              </span>
            </>
          ),
        };
      }),
      isLoading: query.isFetching,
    }),
    [entityType, pluralTypeTitle, query.data?.entities, query.isFetching, search],
  );

  const columns: ColumnDef<EntitySnapshot, unknown>[] = useMemo(() => {
    const fixed: ColumnDef<EntitySnapshot, unknown>[] = [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (row) =>
          row.canonical_name || row.snapshot?.name || row.snapshot?.title || entityRowId(row),
        cell: ({ row }) => {
          const eid = entityRowId(row.original);
          return (
            <Link to={`/entities/${encodeURIComponent(eid)}`} className="font-medium text-primary hover:underline">
              {String(
                row.original.canonical_name ||
                  row.original.snapshot?.name ||
                  row.original.snapshot?.title ||
                  truncateId(eid),
              )}
            </Link>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        accessorKey: "entity_type",
        cell: ({ getValue }) => <TypeBadge type={getValue() as string} />,
      },
      {
        id: "admission",
        header: "Admission",
        cell: ({ row }) => <EntityListAdmissionCell row={row.original} grants={admissionGrants} />,
      },
      {
        id: "observations",
        header: "Observations",
        accessorKey: "observation_count",
        cell: ({ getValue }) => getValue() ?? "—",
      },
      {
        id: "last_observation_at",
        header: "Last Observation",
        accessorKey: "last_observation_at",
        cell: ({ getValue }) => formatDate(getValue() as string),
      },
      {
        id: "entity_id",
        header: "ID",
        accessorFn: (row) => entityRowId(row),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">{truncateId(getValue() as string, 12)}</span>
        ),
      },
    ];

    const schema = entityType ? schemaQ.data : null;
    const fieldKeys = schemaFieldKeys(schema);
    const snapshotColumns = fieldKeys.map((fieldKey) =>
      schemaFieldColumnDef(fieldKey, schema, entityType),
    );

    return [...fixed, ...snapshotColumns];
  }, [admissionGrants, entityType, schemaQ.data]);

  function handleSaveView() {
    if (!entityType) return;
    const name = prompt("View name:");
    if (!name) return;
    saveView({
      id: generateViewId(),
      name,
      entity_type: entityType,
      filters: snapshotFilters,
      sort_by: sortBy,
      sort_order: sortOrder,
      column_visibility: columnVisibility as Record<string, boolean>,
      view_mode: viewMode,
      board_group_field: boardGroupField || undefined,
      created_at: new Date().toISOString(),
    });
  }

  function handleLoadView(view: SavedView) {
    setSnapshotFilters(view.filters);
    setSortBy(view.sort_by);
    setSortOrder(view.sort_order);
    setColumnVisibility(view.column_visibility);
    setViewMode(view.view_mode);
    if (view.board_group_field) setBoardGroupField(view.board_group_field);
    setOffset(0);
  }

  return (
    <PageShell
      title={pluralTypeTitle ?? "Entities"}
      meta={query.data ? `${query.data.total.toLocaleString()} total` : undefined}
      search={headerSearch}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1 h-3 w-3" /> New entity
          </Button>
          {entityType ? (
            <>
              <PinPrimitiveButton
                kind="entity_type"
                href={entityTypeFilterPinHref(entityType)}
                label={pluralTypeTitle ?? entityType}
                entity_type={entityType}
                size="sm"
              />
              <Button variant="outline" size="sm" asChild>
                <Link to="/entity-types">All types</Link>
              </Button>
            </>
          ) : null}
          {showBackgroundQueryRefresh(query) || showBackgroundQueryRefresh(grantsQ) ? (
            <QueryRefreshIndicator />
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <EntityTypeSelect
          value={entityType}
          onValueChange={(nextType) => {
            setEntityType(nextType);
            setOffset(0);
            navigateForEntityType(nextType);
          }}
        />
        {!search && (
          <>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {visibleSortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {schemaFields
                  .filter((f) => !visibleSortOptions.some((o) => o.value === `snapshot.${f}`))
                  .map((f) => (
                    <SelectItem key={`snapshot.${f}`} value={`snapshot.${f}`}>
                      {humanizeKey(f)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
              {sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
            </Button>
          </>
        )}
        <Select
          value={identityBasis || "__any__"}
          onValueChange={(v) => {
            setIdentityBasis(v === "__any__" ? "" : v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-[200px]" title="Filter by identity_basis">
            <SelectValue placeholder="Any identity basis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Any identity basis</SelectItem>
            <SelectItem value="schema_rule">schema_rule</SelectItem>
            <SelectItem value="schema_lookup">schema_lookup</SelectItem>
            <SelectItem value="heuristic_name">heuristic_name (ambiguous)</SelectItem>
            <SelectItem value="heuristic_fallback">heuristic_fallback</SelectItem>
            <SelectItem value="target_id">target_id</SelectItem>
          </SelectContent>
        </Select>
        <EntityTableColumnToggle
          columnIds={listColumnConfig.columnIds}
          columnLabels={listColumnConfig.columnLabels}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />

        {entityType && (
          <>
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-1 h-3 w-3" /> Filters
              {Object.keys(snapshotFilters).length > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {Object.keys(snapshotFilters).length}
                </span>
              )}
            </Button>

            <div className="flex items-center rounded-md border">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode("list")}
              >
                <List className="h-3 w-3" />
              </Button>
              <Button
                variant={viewMode === "board" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode("board")}
              >
                <LayoutGrid className="h-3 w-3" />
              </Button>
            </div>

            {viewMode === "board" && categoricalFields.length > 0 && (
              <Select
                value={boardGroupField || "__none__"}
                onValueChange={(v) => setBoardGroupField(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Group by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Group by...</SelectItem>
                  {categoricalFields.map((f) => (
                    <SelectItem key={f} value={f}>
                      {humanizeKey(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}

        {savedViews.length > 0 && (
          <Select
            value="__none__"
            onValueChange={(v) => {
              if (v === "__none__") return;
              const view = savedViews.find((sv) => sv.id === v);
              if (view) handleLoadView(view);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Saved views" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Saved views</SelectItem>
              {savedViews.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {entityType && (
          <Button variant="ghost" size="sm" onClick={handleSaveView} title="Save current view">
            <Save className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showFilters && entityType && (
        <div className="mt-3 rounded-md border bg-muted/20 p-3">
          <EntityFieldFilterBar
            schema={schemaQ.data}
            filters={snapshotFilters}
            onFiltersChange={(next) => {
              setSnapshotFilters(next);
              setOffset(0);
            }}
          />
        </div>
      )}

      {showInitialQuerySkeleton(query) ? (
        <DataTableSkeleton rows={12} cols={6} />
      ) : query.error ? (
        <QueryErrorAlert title="Could not load entities">{query.error.message}</QueryErrorAlert>
      ) : viewMode === "board" && boardGroupField ? (
        <EntityBoardView
          entities={query.data?.entities ?? []}
          groupField={boardGroupField}
          schema={schemaQ.data}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={query.data?.entities ?? []}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getRowId={(row) => entityRowId(row)}
          />
          {query.data && query.data.total > PAGE_SIZE && (
            <Pagination offset={offset} limit={PAGE_SIZE} total={query.data.total} onPageChange={setOffset} />
          )}
        </>
      )}

      <BulkActionBar
        selectedEntities={selectedEntities}
        schema={schemaQ.data}
        onClearSelection={() => setRowSelection({})}
      />

      <CreateEntityDialog
        entityType={entityType || undefined}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </PageShell>
  );
}

function schemaFieldColumnDef(
  fieldKey: string,
  schema: EntitySchema | null | undefined,
  _entityType: string,
): ColumnDef<EntitySnapshot, unknown> {
  const typeHint =
    (schema?.schema_definition?.fields?.[fieldKey] as { type?: string } | undefined)?.type ??
    (schema?.field_summary?.[fieldKey] as { type?: string } | undefined)?.type;

  return {
    id: snapshotFieldColumnId(fieldKey),
    header: humanizeKey(fieldKey),
    accessorFn: (row) => {
      const snap =
        row.snapshot && typeof row.snapshot === "object"
          ? (row.snapshot as Record<string, unknown>)
          : null;
      return snap?.[fieldKey];
    },
    cell: ({ row, getValue }) => {
      const eid = entityRowId(row.original);
      return (
        <InlineEditCell
          entityId={eid}
          entityType={row.original.entity_type}
          field={fieldKey}
          value={getValue()}
          typeHint={typeHint}
          lastObservationAt={row.original.last_observation_at}
        />
      );
    },
  };
}
