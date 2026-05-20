import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEntityById, useEntityObservations } from "@/hooks/use_entities";
import { useEntityWorldTimeEvents } from "@/hooks/use_timeline";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityLink } from "@/components/shared/entity_link";
import { CopyIdButton } from "@/components/shared/copy_id_button";
import { OffsetPagination as Pagination } from "@/components/ui/pagination";
import {
  ObservationHistorySection,
  WorldTimeEventsSection,
} from "@/components/shared/entity_history_sections";
import { entityDisplayHeadline, humanizeEntityType } from "@/lib/humanize";
import { useSchemaByType } from "@/hooks/use_schemas";
import { showInitialQuerySkeleton } from "@/lib/query_loading";

const PAGE_SIZE = 25;

type HistoryLayer = "observations" | "world-time";

function parseLayer(value: string | null): HistoryLayer {
  return value === "world-time" ? "world-time" : "observations";
}

export default function EntityHistoryPage() {
  const { segment: id } = useParams<{ segment: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const layer = parseLayer(searchParams.get("layer"));
  const [obsOffset, setObsOffset] = useState(0);
  const [worldOffset, setWorldOffset] = useState(0);

  const entity = useEntityById(id);
  const observations = useEntityObservations(id, {
    limit: PAGE_SIZE,
    offset: obsOffset,
  });
  const worldTime = useEntityWorldTimeEvents(id, {
    limit: PAGE_SIZE,
    offset: worldOffset,
  });

  useEffect(() => {
    setObsOffset(0);
    setWorldOffset(0);
  }, [id]);

  const e = entity.data;
  const schemaQuery = useSchemaByType(e?.entity_type);
  const schema = schemaQuery.data ?? null;

  if (showInitialQuerySkeleton(entity)) {
    return (
      <PageShell title="Entity history">
        <DetailPageSkeleton />
      </PageShell>
    );
  }

  if (entity.error) {
    return (
      <PageShell title="Entity history">
        <QueryErrorAlert title="Could not load entity">{entity.error.message}</QueryErrorAlert>
      </PageShell>
    );
  }

  if (!e) {
    return (
      <PageShell title="Entity history">
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

  const observationTotal =
    observations.data?.total ??
    e.observation_count ??
    observations.data?.observations?.length ??
    0;
  const worldTimeTotal = worldTime.data?.total ?? worldTime.data?.events?.length ?? 0;

  const description = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{humanType}</span>
      <EntityLink id={entityId} name={displayName} className="font-medium" />
      <CopyIdButton id={entityId} />
    </div>
  );

  return (
    <PageShell
      title="Entity history"
      description={description}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to={`/entities/${encodeURIComponent(entityId)}`}>Back to entity</Link>
        </Button>
      }
    >
      <Tabs
        value={layer}
        onValueChange={(next) => {
          setSearchParams({ layer: next }, { replace: true });
        }}
        className="space-y-6"
      >
        <TabsList className="h-10">
          <TabsTrigger value="observations">
            Observation history
            {observationTotal > 0 ? (
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                ({observationTotal.toLocaleString()})
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="world-time">
            World-time dates
            {worldTimeTotal > 0 ? (
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                ({worldTimeTotal.toLocaleString()})
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="observations" className="mt-0 space-y-4">
          <ObservationHistorySection
            entityId={entityId}
            observations={observations.data?.observations ?? []}
            total={observationTotal}
            loading={showInitialQuerySkeleton(observations)}
            error={observations.error as Error | null}
            showFullPageLink={false}
            footerAction={
              observationTotal > PAGE_SIZE ? (
                <Pagination
                  offset={obsOffset}
                  limit={PAGE_SIZE}
                  total={observationTotal}
                  onPageChange={setObsOffset}
                />
              ) : null
            }
          />
        </TabsContent>

        <TabsContent value="world-time" className="mt-0 space-y-4">
          <WorldTimeEventsSection
            entityId={entityId}
            events={worldTime.data?.events ?? []}
            total={worldTimeTotal}
            loading={showInitialQuerySkeleton(worldTime)}
            error={worldTime.error as Error | null}
            showFullPageLink={false}
            footerAction={
              worldTimeTotal > PAGE_SIZE ? (
                <Pagination
                  offset={worldOffset}
                  limit={PAGE_SIZE}
                  total={worldTimeTotal}
                  onPageChange={setWorldOffset}
                />
              ) : null
            }
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
