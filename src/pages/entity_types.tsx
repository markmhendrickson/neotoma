import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PinPrimitiveButton } from "@/components/shared/pin_primitive_button";
import { entityTypeFilterPinHref } from "@/lib/pinned_primitives";
import { useStats } from "@/hooks/use_stats";
import { useSchemas } from "@/hooks/use_schemas";
import { PageShell } from "@/components/layout/page_shell";
import type { HeaderSearchContextValue } from "@/components/layout/page_title_context";
import { CardGridSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { getIconForEntityType } from "@/lib/entity_type_icons";
import { humanizeEntityType } from "@/lib/humanize";
import { pluralizeEntityTypeLabel } from "@/lib/entity_type_labels";
import { cn } from "@/lib/utils";

export default function EntityTypesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const statsQ = useStats();
  const schemasQ = useSchemas();

  const schemaMetadataByType = useMemo(() => {
    const map = new Map<string, Record<string, unknown> | undefined>();
    for (const schema of schemasQ.data?.schemas ?? []) {
      map.set(schema.entity_type, schema.metadata);
    }
    return map;
  }, [schemasQ.data?.schemas]);

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

  const typeRows = useMemo(() => {
    const counts = statsQ.data?.entities_by_type;
    if (!counts) return [];
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([typeA, countA], [typeB, countB]) => countB - countA || typeA.localeCompare(typeB));
  }, [statsQ.data?.entities_by_type]);

  const filteredTypeRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return typeRows;
    return typeRows.filter(([type, count]) => {
      const singular = humanizeEntityType(type, schemaLabelByType.get(type));
      const plural = pluralizeEntityTypeLabel(type, schemaLabelByType.get(type));
      const haystack = `${type} ${singular} ${plural} ${count}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [typeRows, searchQuery, schemaLabelByType]);

  const headerMeta = useMemo(() => {
    if (typeRows.length === 0) return undefined;
    const q = searchQuery.trim();
    if (q && filteredTypeRows.length !== typeRows.length) {
      return `${filteredTypeRows.length.toLocaleString()} of ${typeRows.length.toLocaleString()} types`;
    }
    return `${typeRows.length.toLocaleString()} types`;
  }, [typeRows.length, filteredTypeRows.length, searchQuery]);

  const headerSearch = useMemo<HeaderSearchContextValue>(
    () => ({
      value: searchQuery,
      onValueChange: (nextSearch) => {
        setSearchQuery(nextSearch);
      },
      placeholder: "Search entity type or label…",
      ariaLabel: "Search entity types",
    }),
    [searchQuery],
  );

  return (
    <PageShell
      title="Entity types"
      meta={headerMeta}
      search={headerSearch}
      actions={
        showBackgroundQueryRefresh(statsQ) || showBackgroundQueryRefresh(schemasQ) ? (
          <QueryRefreshIndicator />
        ) : undefined
      }
    >
      {showInitialQuerySkeleton(statsQ) && typeRows.length === 0 ? (
        <CardGridSkeleton cards={12} />
      ) : statsQ.error ? (
        <QueryErrorAlert title="Could not load entity types">{statsQ.error.message}</QueryErrorAlert>
      ) : typeRows.length > 0 ? (
        <div className="space-y-4">
          {filteredTypeRows.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTypeRows.map(([type, count]) => {
                const Icon = getIconForEntityType(type, schemaMetadataByType.get(type));
                const schemaLabel = schemaLabelByType.get(type);
                const pluralLabel = pluralizeEntityTypeLabel(type, schemaLabel);

                return (
                  <div
                    key={type}
                    className={cn(
                      "flex min-w-0 items-center gap-1 rounded-md border border-border bg-background pr-1 text-sm transition-colors hover:bg-muted/50",
                    )}
                  >
                    <Link
                      to={entityTypeFilterPinHref(type)}
                      title={type}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-medium">{pluralLabel}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {count.toLocaleString()}
                      </span>
                    </Link>
                    <PinPrimitiveButton
                      kind="entity_type"
                      href={entityTypeFilterPinHref(type)}
                      label={pluralLabel}
                      entity_type={type}
                      size="icon"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No entity types match your search.
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No entity types found.
        </div>
      )}
    </PageShell>
  );
}
