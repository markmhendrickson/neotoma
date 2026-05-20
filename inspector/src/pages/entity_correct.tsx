import { Link, useParams } from "react-router-dom";
import { useEntityById } from "@/hooks/use_entities";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { EntityCorrectFieldsCard } from "@/components/shared/entity_correct_fields";
import { EntityLink } from "@/components/shared/entity_link";
import { CopyIdButton } from "@/components/shared/copy_id_button";
import { entityDisplayHeadline, humanizeEntityType } from "@/lib/humanize";
import { useSchemaByType } from "@/hooks/use_schemas";
import { showInitialQuerySkeleton } from "@/lib/query_loading";
import { Button } from "@/components/ui/button";

export default function EntityCorrectPage() {
  const { segment: id } = useParams<{ segment: string }>();
  const entity = useEntityById(id);
  const e = entity.data;
  const schemaQuery = useSchemaByType(e?.entity_type);
  const schema = schemaQuery.data ?? null;

  if (showInitialQuerySkeleton(entity)) {
    return (
      <PageShell title="Correct">
        <DetailPageSkeleton />
      </PageShell>
    );
  }

  if (entity.error) {
    return (
      <PageShell title="Correct">
        <QueryErrorAlert title="Could not load entity">{entity.error.message}</QueryErrorAlert>
      </PageShell>
    );
  }

  if (!e) {
    return (
      <PageShell title="Correct">
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

  const description = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{humanType}</span>
      <EntityLink id={entityId} name={displayName} className="font-medium" />
      <CopyIdButton id={entityId} />
    </div>
  );

  return (
    <PageShell
      title="Correct"
      description={description}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to={`/entities/${encodeURIComponent(entityId)}`}>Back to entity</Link>
        </Button>
      }
    >
      <EntityCorrectFieldsCard
        entityId={entityId}
        entityType={e.entity_type}
        snapshot={snapshot}
        lastObservationAt={e.last_observation_at ?? null}
      />
    </PageShell>
  );
}
