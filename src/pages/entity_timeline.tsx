import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useEntityById, useEntityObservations } from "@/hooks/use_entities";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  ListSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EntityLink } from "@/components/shared/entity_link";
import { CopyIdButton } from "@/components/shared/copy_id_button";
import { ObservationTimeline } from "@/components/shared/observation_timeline";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import { entityDisplayHeadline, humanizeEntityType } from "@/lib/humanize";
import { useSchemaByType } from "@/hooks/use_schemas";
import { showInitialQuerySkeleton } from "@/lib/query_loading";

const PAGE_SIZE = 25;

export default function EntityTimelinePage() {
  const { segment: id } = useParams<{ segment: string }>();
  const [offset, setOffset] = useState(0);

  const entity = useEntityById(id);
  const observations = useEntityObservations(id, { limit: PAGE_SIZE, offset });

  const e = entity.data;
  const schemaQuery = useSchemaByType(e?.entity_type);
  const schema = schemaQuery.data ?? null;

  if (showInitialQuerySkeleton(entity)) {
    return (
      <PageShell title="Timeline">
        <DetailPageSkeleton />
      </PageShell>
    );
  }

  if (entity.error) {
    return (
      <PageShell title="Timeline">
        <QueryErrorAlert title="Could not load entity">{entity.error.message}</QueryErrorAlert>
      </PageShell>
    );
  }

  if (!e) {
    return (
      <PageShell title="Timeline">
        <p className="text-sm text-muted-foreground">Entity not found.</p>
      </PageShell>
    );
  }

  const entityId = e.entity_id ?? e.id ?? id ?? "";
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

  const total =
    observations.data?.total ??
    e.observation_count ??
    observations.data?.observations?.length ??
    0;

  const description = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{humanType}</span>
      <EntityLink id={entityId} name={displayName} className="font-medium" />
      <CopyIdButton id={entityId} />
    </div>
  );

  return (
    <PageShell
      title="Timeline"
      description={description}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to={`/entities/${encodeURIComponent(entityId)}`}>Back to entity</Link>
        </Button>
      }
    >
      <section className="space-y-4">
        {showInitialQuerySkeleton(observations) ? (
          <ListSkeleton rows={8} />
        ) : observations.error ? (
          <QueryErrorAlert title="Could not load timeline">
            {(observations.error as Error).message}
          </QueryErrorAlert>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <ObservationTimeline
                  observations={observations.data?.observations ?? []}
                  developerView={false}
                />
              </CardContent>
            </Card>
            {total > PAGE_SIZE ? (
              <Pagination
                offset={offset}
                limit={PAGE_SIZE}
                total={total}
                onPageChange={setOffset}
              />
            ) : null}
          </>
        )}
      </section>
    </PageShell>
  );
}
