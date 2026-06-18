import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnDef, OnChangeFn, VisibilityState } from "@tanstack/react-table";
import { Search as SearchIcon, SearchX } from "lucide-react";
import { isApiUrlConfigured } from "@/api/client";
import { PageShell } from "@/components/layout/page_shell";
import { ApiNotConfiguredState } from "@/components/shared/api_not_configured_state";
import { EmptyState } from "@/components/shared/empty_state";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton, ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { EntityTypeSelect } from "@/components/shared/entity_type_select";
import { EntityTableColumnToggle } from "@/components/shared/entity_table_column_toggle";
import {
  DEFAULT_SEARCH_ENTITY_COLUMN_VISIBILITY,
  SEARCH_ENTITY_COLUMN_IDS,
} from "@/lib/entity_table_columns";
import { RecentRecordsFeed } from "@/components/shared/recent_records_feed";
import { TypeBadge } from "@/components/shared/type_badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { SEARCH_RESULT_PAGE_SIZE, usePrimitiveSearch } from "@/hooks/use_primitive_search";
import { OffsetPagination } from "@/components/ui/pagination";
import { showInitialQuerySkeleton } from "@/lib/query_loading";
import {
  DEFAULT_SEARCH_PRIMITIVE_KIND,
  SEARCH_PRIMITIVE_KINDS,
  SEARCH_PRIMITIVE_LABELS,
  isSearchPrimitiveKind,
  type SearchPrimitiveKind,
} from "@/lib/search_primitives";
import {
  buildSearchLocation,
  locationsMatchForSearch,
  resolveSearchQuery,
} from "@/lib/search_route";
import { formatDate, truncateId } from "@/lib/utils";
import { sourceDisplaySummary, sourceDisplayTitle } from "@/lib/source_display";
import type { EntitySnapshot, Source } from "@/types/api";

const SEARCH_DEBOUNCE_MS = 150;

function entityRowId(row: EntitySnapshot): string {
  return row.entity_id ?? row.id ?? "";
}

export default function SearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSearch = resolveSearchQuery(location.pathname, searchParams);
  const urlKind = searchParams.get("kind");
  const urlEntityType = searchParams.get("type") ?? "";
  const activeKind: SearchPrimitiveKind = isSearchPrimitiveKind(urlKind)
    ? urlKind
    : DEFAULT_SEARCH_PRIMITIVE_KIND;

  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch.trim());
  const [entityType, setEntityType] = useState(urlEntityType);
  const [offset, setOffset] = useState(0);
  const [entityColumnVisibility, setEntityColumnVisibility] = useState<VisibilityState>(
    DEFAULT_SEARCH_ENTITY_COLUMN_VISIBILITY,
  );

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    setEntityType(urlEntityType);
  }, [urlEntityType]);

  useEffect(() => {
    const legacyQuery = searchParams.get("search");
    if (!legacyQuery || location.pathname !== "/search") {
      return;
    }
    const target = buildSearchLocation({
      query: legacyQuery,
      kind: searchParams.get("kind"),
      entityType: searchParams.get("type"),
      searchParams,
    });
    navigate(target, { replace: true });
  }, [location.pathname, navigate, searchParams]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, activeKind, entityType]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const normalized = search.trim();
      setDebouncedSearch(normalized);

      const target = buildSearchLocation({
        query: normalized,
        kind: activeKind !== DEFAULT_SEARCH_PRIMITIVE_KIND ? activeKind : null,
        entityType: activeKind === "entities" && entityType ? entityType : null,
        searchParams,
      });

      if (locationsMatchForSearch(location, target)) {
        return;
      }

      navigate(target, { replace: true });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [search, searchParams, navigate, location, urlSearch, activeKind, entityType]);

  function setActiveKind(kind: SearchPrimitiveKind) {
    setOffset(0);
    navigate(
      buildSearchLocation({
        query: debouncedSearch,
        kind: kind !== DEFAULT_SEARCH_PRIMITIVE_KIND ? kind : null,
        entityType: kind === "entities" && entityType ? entityType : null,
        searchParams,
      }),
      { replace: true },
    );
  }

  function setEntityTypeFilter(nextType: string) {
    setOffset(0);
    setEntityType(nextType);
    navigate(
      buildSearchLocation({
        query: debouncedSearch,
        kind: activeKind !== DEFAULT_SEARCH_PRIMITIVE_KIND ? activeKind : null,
        entityType: nextType || null,
        searchParams,
      }),
      { replace: true },
    );
  }

  const resultsQuery = usePrimitiveSearch(
    activeKind,
    debouncedSearch,
    offset,
    activeKind === "entities" ? entityType : undefined,
  );

  const entityColumns = useMemo<ColumnDef<EntitySnapshot, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => row.canonical_name || row.snapshot?.name || row.snapshot?.title || entityRowId(row),
        cell: ({ row }) => {
          const entityId = entityRowId(row.original);
          return (
            <Link
              to={`/entities/${encodeURIComponent(entityId)}`}
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              {String(
                row.original.canonical_name ||
                  row.original.snapshot?.name ||
                  row.original.snapshot?.title ||
                  truncateId(entityId),
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
        id: "last_observation_at",
        header: activeKind === "entity_snapshots" ? "Snapshot at" : "Last Observation",
        accessorKey: "last_observation_at",
        cell: ({ getValue }) => formatDate(getValue() as string),
      },
      {
        id: "entity_id",
        header: "ID",
        accessorFn: (row) => entityRowId(row),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {truncateId(getValue() as string, 12)}
          </span>
        ),
      },
    ],
    [activeKind],
  );

  const isSearching = debouncedSearch.length > 0;
  const activeLabel = SEARCH_PRIMITIVE_LABELS[activeKind].toLowerCase();

  const pageDescription = !isSearching
    ? "Search one primitive at a time — entities, snapshots, sources, observations, and more."
    : resultsQuery.isFetching && !resultsQuery.data
      ? `Searching ${activeLabel}…`
      : undefined;

  if (!isApiUrlConfigured()) {
    return (
      <PageShell title="Search">
        <ApiNotConfiguredState description="Search needs a configured Neotoma API to query records. Start a sandbox or open Settings to connect." />
      </PageShell>
    );
  }

  return (
    <PageShell title="Search" description={pageDescription}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[200px] flex-1 max-w-xl">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${activeLabel}…`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              aria-label={`Search ${activeLabel}`}
            />
          </div>
          {activeKind === "entities" ? (
            <EntityTypeSelect value={entityType} onValueChange={setEntityTypeFilter} />
          ) : null}
          {activeKind === "entities" || activeKind === "entity_snapshots" ? (
            <EntityTableColumnToggle
              columnIds={SEARCH_ENTITY_COLUMN_IDS}
              columnVisibility={entityColumnVisibility}
              onColumnVisibilityChange={setEntityColumnVisibility}
            />
          ) : null}
        </div>

        <Tabs
          value={activeKind}
          onValueChange={(value) => {
            if (isSearchPrimitiveKind(value)) {
              setActiveKind(value);
            }
          }}
        >
          <TabsList className="flex h-auto min-h-10 w-full flex-wrap justify-start gap-1">
            {SEARCH_PRIMITIVE_KINDS.map((kind) => (
              <TabsTrigger key={kind} value={kind} className="text-xs sm:text-sm">
                {SEARCH_PRIMITIVE_LABELS[kind]}
              </TabsTrigger>
            ))}
          </TabsList>

          {SEARCH_PRIMITIVE_KINDS.map((kind) => (
            <TabsContent key={kind} value={kind} className="mt-4">
              {!isSearching ? (
                <EmptyState
                  icon={SearchIcon}
                  title="Start typing to search"
                  description={`Type a keyword to search ${SEARCH_PRIMITIVE_LABELS[kind].toLowerCase()} only.`}
                />
              ) : kind !== activeKind ? null : (
                <PrimitiveSearchResults
                  kind={kind}
                  query={debouncedSearch}
                  offset={offset}
                  onPageChange={setOffset}
                  resultsQuery={resultsQuery}
                  entityColumns={entityColumns}
                  entityColumnVisibility={entityColumnVisibility}
                  onEntityColumnVisibilityChange={setEntityColumnVisibility}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </PageShell>
  );
}

function SearchResultsPagination({
  total,
  offset,
  onPageChange,
}: {
  total: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
}) {
  if (total === 0) {
    return null;
  }
  return (
    <OffsetPagination
      offset={offset}
      limit={SEARCH_RESULT_PAGE_SIZE}
      total={total}
      onPageChange={onPageChange}
    />
  );
}

function PrimitiveSearchResults({
  kind,
  query,
  offset,
  onPageChange,
  resultsQuery,
  entityColumns,
  entityColumnVisibility,
  onEntityColumnVisibilityChange,
}: {
  kind: SearchPrimitiveKind;
  query: string;
  offset: number;
  onPageChange: (newOffset: number) => void;
  resultsQuery: ReturnType<typeof usePrimitiveSearch>;
  entityColumns: ColumnDef<EntitySnapshot, unknown>[];
  entityColumnVisibility: VisibilityState;
  onEntityColumnVisibilityChange: OnChangeFn<VisibilityState>;
}) {
  if (showInitialQuerySkeleton(resultsQuery)) {
    if (kind === "sources") {
      return <ListSkeleton rows={6} />;
    }
    if (kind === "entities" || kind === "entity_snapshots") {
      return <DataTableSkeleton rows={8} cols={4} />;
    }
    return <ListSkeleton rows={8} />;
  }

  if (resultsQuery.error) {
    return (
      <QueryErrorAlert title={`Could not load ${SEARCH_PRIMITIVE_LABELS[kind].toLowerCase()} matches`}>
        {resultsQuery.error.message}
      </QueryErrorAlert>
    );
  }

  const data = resultsQuery.data;
  if (!data || data.kind !== kind) {
    return null;
  }

  if (data.kind === "entities" || data.kind === "entity_snapshots") {
    const entities = data.entities;
    if (entities.length === 0) {
      return (
        <EmptyMatches
          kind={kind}
          query={query}
          hint={
            kind === "entity_snapshots"
              ? "No entity snapshots matched. Try the Entities tab for the same query."
              : undefined
          }
        />
      );
    }
    return (
      <div className="space-y-3">
        <DataTable
          columns={entityColumns}
          data={entities}
          columnVisibility={entityColumnVisibility}
          onColumnVisibilityChange={onEntityColumnVisibilityChange}
        />
        <SearchResultsPagination total={data.total} offset={offset} onPageChange={onPageChange} />
      </div>
    );
  }

  if (data.kind === "sources") {
    if (data.sources.length === 0) {
      return <EmptyMatches kind={kind} query={query} />;
    }
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {data.sources.map((source) => (
            <SourceSearchCard key={source.id} source={source} />
          ))}
        </div>
        <SearchResultsPagination total={data.total} offset={offset} onPageChange={onPageChange} />
      </div>
    );
  }

  if (!("items" in data)) {
    return null;
  }

  if (data.total === 0) {
    return (
      <EmptyMatches
        kind={kind}
        query={query}
        hint={`Searched the ${data.scanLimit.toLocaleString()} most recent ${SEARCH_PRIMITIVE_LABELS[kind].toLowerCase()} records. Older matches may not appear.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <RecentRecordsFeed items={data.items} showBuckets={false} />
      <SearchResultsPagination total={data.total} offset={offset} onPageChange={onPageChange} />
    </div>
  );
}

function EmptyMatches({
  kind,
  query,
  hint,
}: {
  kind: SearchPrimitiveKind;
  query: string;
  hint?: string;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title={`No matching ${SEARCH_PRIMITIVE_LABELS[kind].toLowerCase()}`}
      description={
        <>
          <span className="block">
            Nothing came back for &ldquo;{query}&rdquo;.
          </span>
          {hint ? <span className="mt-2 block">{hint}</span> : null}
        </>
      }
    />
  );
}

function SourceSearchCard({ source }: { source: Source }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/sources/${encodeURIComponent(source.id)}`}
            className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            {sourceDisplayTitle(source)}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">{sourceDisplaySummary(source)}</p>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {truncateId(source.id, 12)}
        </span>
      </div>
    </div>
  );
}
