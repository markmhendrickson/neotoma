import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useEntityById, useEntityRelationships } from "@/hooks/use_entities";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  ListSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityLink } from "@/components/shared/entity_link";
import { CopyIdButton } from "@/components/shared/copy_id_button";
import { RelationshipEntityList } from "@/components/shared/relationship_entity_list";
import { SubpagePinButton } from "@/components/shared/subpage_pin_button";
import { TypeBadge } from "@/components/shared/type_badge";
import {
  buildDirectedRelationshipRows,
  filterDirectedRelationshipRows,
  filterDirectedRelationshipRowsByKeyword,
} from "@/lib/relationship_panel_groups";
import { entityRelationshipSubpageHref } from "@/lib/entity_relationship_routes";
import { entityDisplayHeadline, humanizeEntityType, humanizeRelationshipType } from "@/lib/humanize";
import { pluralizeEntityTypeLabel } from "@/lib/entity_type_labels";
import { useSchemaByType } from "@/hooks/use_schemas";
import { showInitialQuerySkeleton } from "@/lib/query_loading";

export default function EntityRelationshipsByTypePage() {
  const [listFilterQuery, setListFilterQuery] = useState("");
  const { segment: id, relationshipType, relatedEntityType } = useParams<{
    segment: string;
    relationshipType: string;
    relatedEntityType: string;
  }>();

  const entity = useEntityById(id);
  const relationships = useEntityRelationships(id, { expand_entities: true });

  const e = entity.data;
  const schemaQuery = useSchemaByType(e?.entity_type);
  const schema = schemaQuery.data ?? null;

  const typeFilteredRows = useMemo(() => {
    if (!relationshipType || !relatedEntityType) return [];
    const rows = buildDirectedRelationshipRows(relationships.data);
    return filterDirectedRelationshipRows(rows, relationshipType, relatedEntityType);
  }, [relationships.data, relationshipType, relatedEntityType]);

  const filteredRows = useMemo(
    () => filterDirectedRelationshipRowsByKeyword(typeFilteredRows, listFilterQuery),
    [typeFilteredRows, listFilterQuery],
  );

  const listFilterActive = listFilterQuery.trim().length > 0;

  if (showInitialQuerySkeleton(entity)) {
    return (
      <PageShell title="Related entities">
        <DetailPageSkeleton />
      </PageShell>
    );
  }

  if (entity.error) {
    return (
      <PageShell title="Related entities">
        <QueryErrorAlert title="Could not load entity">{entity.error.message}</QueryErrorAlert>
      </PageShell>
    );
  }

  if (!e || !id || !relationshipType || !relatedEntityType) {
    return (
      <PageShell title="Related entities">
        <p className="text-sm text-muted-foreground">Entity or relationship group not found.</p>
      </PageShell>
    );
  }

  const entityId = e.entity_id ?? e.id ?? id;
  const snapshot = (e.snapshot && typeof e.snapshot === "object"
    ? (e.snapshot as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const displayName = entityDisplayHeadline({
    canonical_name: e.canonical_name,
    snapshot,
    entity_type: e.entity_type,
    entity_type_label: e.entity_type_label ?? undefined,
    entity_id: entityId,
    id: e.id,
  });
  const schemaLabel =
    e.entity_type_label ||
    (schema?.metadata && typeof schema.metadata === "object"
      ? ((schema.metadata as Record<string, unknown>).label as string | undefined)
      : undefined);
  const humanType = humanizeEntityType(e.entity_type, schemaLabel);
  const relLabel = humanizeRelationshipType(relationshipType);
  const relatedTypeLabel = pluralizeEntityTypeLabel(
    relatedEntityType,
    filteredRows[0]?.otherTypeLabel ?? null,
  );
  const pageTitle = `${relatedTypeLabel} · ${relLabel}`;
  const pinHref = entityRelationshipSubpageHref(entityId, relationshipType, relatedEntityType);

  const description = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{humanType}</span>
      <EntityLink id={entityId} name={displayName} className="font-medium" />
      <CopyIdButton id={entityId} />
      <TypeBadge type={relatedEntityType} label={relatedTypeLabel} humanize className="shrink-0" />
    </div>
  );

  return (
    <PageShell
      title={pageTitle}
      description={description}
      meta={`${typeFilteredRows.length.toLocaleString()} related`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SubpagePinButton
            href={pinHref}
            kind="entity_relationships"
            label={displayName}
            entity_type={e.entity_type}
            related_entity_type={relatedEntityType}
            subtitle={relatedTypeLabel}
          />
          <Button variant="outline" size="sm" asChild>
            <Link to={`/entities/${encodeURIComponent(entityId)}`}>Back to entity</Link>
          </Button>
        </div>
      }
    >
      <section className="space-y-4">
        {showInitialQuerySkeleton(relationships) ? (
          <ListSkeleton rows={8} />
        ) : relationships.error ? (
          <QueryErrorAlert title="Could not load relationships">
            {(relationships.error as Error).message}
          </QueryErrorAlert>
        ) : (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={listFilterQuery}
                    onChange={(event) => setListFilterQuery(event.target.value)}
                    placeholder="Filter by keyword…"
                    aria-label="Filter related entities by keyword"
                    className="pl-8"
                  />
                </div>
                {listFilterActive && typeFilteredRows.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {filteredRows.length.toLocaleString()} of{" "}
                    {typeFilteredRows.length.toLocaleString()} shown
                  </p>
                ) : null}
              </div>
              {listFilterActive && filteredRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No matches for &ldquo;{listFilterQuery.trim()}&rdquo;.
                </p>
              ) : (
                <RelationshipEntityList
                  rows={filteredRows}
                  selfId={entityId}
                  developerView={false}
                />
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </PageShell>
  );
}
