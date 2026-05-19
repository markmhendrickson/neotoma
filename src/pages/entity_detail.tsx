import { useParams, Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import {
  useEntityById,
  useEntityObservations,
  useEntityRelationships,
} from "@/hooks/use_entities";
import { useSchemaByType } from "@/hooks/use_schemas";
import { useGraphNeighborhood } from "@/hooks/use_graph";
import { useAgentGrants } from "@/hooks/use_agents";
import {
  useDeleteEntity,
  useRestoreEntity,
  useMergeEntities,
} from "@/hooks/use_mutations";
import { getSourceById } from "@/api/endpoints/sources";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  GraphAreaSkeleton,
  ListSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityLink } from "@/components/shared/entity_link";
import { JsonViewer } from "@/components/shared/json_viewer";
import { AttributionCard } from "@/components/shared/attribution_card";
import { EntityAdmissionGrantsSection } from "@/components/shared/entity_admission_grants_section";
import { TurnProvenanceCard } from "@/components/shared/turn_provenance_card";
import {
  EntityOverviewCard,
  EntityOverviewStatsRow,
  MergedIntoPill,
} from "@/components/shared/entity_overview_card";
import {
  PeerConfigNervousCard,
  SubmissionConfigNervousCard,
  SubscriptionNervousCard,
} from "@/components/shared/nervous_system_entity_preview";
import {
  RawFragmentsFieldList,
  SnapshotFieldList,
} from "@/components/shared/snapshot_field_list";
import { ObservationTimeline } from "@/components/shared/observation_timeline";
import { RelationshipPanel } from "@/components/shared/relationship_panel";
import { CopyIdButton } from "@/components/shared/copy_id_button";
import { entityDisplayHeadline, humanizeEntityType } from "@/lib/humanize";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { EntityDetailActionsMenu } from "@/components/shared/entity_detail_actions_menu";
import { ChevronDown, FileText } from "lucide-react";
import { SourceInlinePreview } from "@/components/shared/source_inline_preview";
import {
  sourceDisplaySummary,
  sourceDisplayTitle,
  sourcePreviewChips,
} from "@/lib/source_display";
import { useMemo } from "react";
import type { Source } from "@/types/api";
export default function EntityDetailPage() {
  const { segment: id } = useParams<{ segment: string }>();

  const entity = useEntityById(id);
  const TIMELINE_PREVIEW_LIMIT = 3;
  const observations = useEntityObservations(id, { limit: TIMELINE_PREVIEW_LIMIT });
  const observationsForSources = useEntityObservations(id, { limit: 100 });
  const relationships = useEntityRelationships(id, { expand_entities: true });
  const grantsQ = useAgentGrants({ status: "all" });

  const e = entity.data;
  const schemaQuery = useSchemaByType(e?.entity_type);
  const schema = schemaQuery.data ?? null;

  const graph = useGraphNeighborhood(
    id
      ? {
          node_id: id,
          include_relationships: true,
          include_sources: true,
          include_events: true,
        }
      : null,
  );

  const deleteMut = useDeleteEntity();
  const restoreMut = useRestoreEntity();
  const mergeMut = useMergeEntities();

  const relatedSourceIds = useMemo(
    () =>
      Array.from(
        new Set(
          (observationsForSources.data?.observations ?? [])
            .map((observation) => observation.source_id)
            .filter((sourceId): sourceId is string => typeof sourceId === "string" && sourceId.trim().length > 0),
        ),
      ),
    [observationsForSources.data?.observations],
  );

  const latestObservationProvenance = useMemo<Record<string, unknown> | null>(
    () => {
      const obs = observationsForSources.data?.observations ?? [];
      for (const observation of obs) {
        const prov = observation.provenance;
        if (prov && typeof prov === "object") {
          return prov as Record<string, unknown>;
        }
      }
      return null;
    },
    [observationsForSources.data?.observations],
  );
  const relatedSourceQueries = useQueries({
    queries: relatedSourceIds.map((sourceId) => ({
      queryKey: ["source", sourceId],
      queryFn: () => getSourceById(sourceId),
      enabled: isApiUrlConfigured(),
    })),
  });
  const relatedSources = relatedSourceQueries
    .map((query) => query.data)
    .filter((source): source is Source => Boolean(source));
  const relatedSourcesError = relatedSourceQueries.find((query) => query.error)?.error as Error | undefined;
  const relatedSourcesLoading =
    relatedSourceIds.length > 0 &&
    relatedSources.length === 0 &&
    relatedSourceQueries.some((query) => showInitialQuerySkeleton(query));

  if (showInitialQuerySkeleton(entity)) {
    return (
      <PageShell title="Loading…">
        <DetailPageSkeleton />
      </PageShell>
    );
  }
  if (entity.error) {
    return (
      <PageShell title="Error">
        <div className="p-6">
          <QueryErrorAlert title="Could not load entity">{entity.error.message}</QueryErrorAlert>
        </div>
      </PageShell>
    );
  }
  if (!e) {
    return (
      <PageShell title="Not Found">
        <div className="text-muted-foreground p-6">Entity not found.</div>
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
  const pageHeading = displayName;
  const schemaLabel =
    e.entity_type_label ||
    (schema?.metadata && typeof schema.metadata === "object"
      ? ((schema.metadata as Record<string, unknown>).label as string | undefined)
      : undefined);
  const humanType = humanizeEntityType(e.entity_type, schemaLabel);

  const observationCount =
    observations.data?.total ?? e.observation_count ?? observations.data?.observations?.length ?? 0;
  const timelinePreview = observations.data?.observations ?? [];
  const hasMoreTimeline = observationCount > timelinePreview.length;
  const relationshipCount = relationships.data?.relationships?.length ?? 0;

  const entityPageRefreshing =
    showBackgroundQueryRefresh(entity) ||
    showBackgroundQueryRefresh(observations) ||
    showBackgroundQueryRefresh(relationships) ||
    showBackgroundQueryRefresh(graph) ||
    showBackgroundQueryRefresh(schemaQuery) ||
    showBackgroundQueryRefresh(grantsQ);

  const admissionGrants = grantsQ.data?.grants ?? [];

  const pageActions = (
    <EntityDetailActionsMenu
      entityId={entityId}
      entityType={e.entity_type}
      displayName={displayName}
      showRefresh={entityPageRefreshing}
      deleteMut={deleteMut}
      restoreMut={restoreMut}
      mergeMut={mergeMut}
    />
  );

  const createdAt = e.created_at ?? e.computed_at;
  const header = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground" title={e.entity_type}>
          {humanType}
        </span>
        <CopyIdButton id={entityId} />
      </div>
      <EntityOverviewStatsRow
        observationCount={observationCount}
        relationshipCount={relationshipCount}
        sourceCount={relatedSourceIds.length}
        lastUpdated={e.last_observation_at}
        createdAt={createdAt}
      />
    </div>
  );

  return (
    <PageShell title={displayName} actions={pageActions}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{pageHeading}</h1>
        {header}
      </div>
      {e.entity_type === "conversation" ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <Link
            to={`/conversations/${encodeURIComponent(entityId)}`}
            className="font-medium text-primary hover:underline"
          >
            View conversation transcript
          </Link>
          <span className="text-muted-foreground">
            {" "}
            — messages, related entities, and per-turn hook summaries.
          </span>
        </div>
      ) : null}
      {e.entity_type === "subscription" ? <SubscriptionNervousCard snapshot={snapshot} /> : null}
      {e.entity_type === "peer_config" ? <PeerConfigNervousCard snapshot={snapshot} /> : null}
      {e.entity_type === "submission_config" ? <SubmissionConfigNervousCard snapshot={snapshot} /> : null}
      <EntityOverviewCard
        entity={e}
        schema={schema}
        showHeroTitle={false}
        showTypeBadge={false}
        omitPrimaryFields
        mergedInto={
          e.merged_to_entity_id ? (
            <MergedIntoPill targetId={e.merged_to_entity_id} />
          ) : undefined
        }
      >
        <div className="space-y-4">
          <SnapshotFieldList
            entityId={entityId}
            snapshot={snapshot}
            schema={schema}
            developerView={false}
          />
          {e.raw_fragments && Object.keys(e.raw_fragments).length > 0 ? (
            <RawFragmentsFieldList rawFragments={e.raw_fragments} />
          ) : null}
        </div>
      </EntityOverviewCard>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Relationships</h2>
        {showInitialQuerySkeleton(relationships) ? (
          <ListSkeleton rows={4} />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <RelationshipPanel
                entityId={entityId}
                data={relationships.data}
                developerView={false}
              />
              <div className="mt-4">
                <Link to={`/graph?node=${encodeURIComponent(entityId)}`}>
                  <Button variant="outline" size="sm">
                    Open in graph explorer
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Timeline</h2>
          {hasMoreTimeline ? (
            <Link
              to={`/entities/${encodeURIComponent(entityId)}/timeline`}
              className="text-sm font-medium text-primary hover:underline"
            >
              View full timeline ({observationCount.toLocaleString()})
            </Link>
          ) : null}
        </div>
        {showInitialQuerySkeleton(observations) ? (
          <ListSkeleton rows={3} />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <ObservationTimeline observations={timelinePreview} developerView={false} />
              {hasMoreTimeline ? (
                <div className="mt-4 border-t pt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/entities/${encodeURIComponent(entityId)}/timeline`}>
                      Open full timeline
                    </Link>
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      </section>

      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Sources</h2>
          {relatedSourcesError ? (
            <QueryErrorAlert title="Could not load sources">{relatedSourcesError.message}</QueryErrorAlert>
          ) : relatedSourcesLoading ? (
            <ListSkeleton rows={4} />
          ) : relatedSourceIds.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">No sources linked to this entity yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {relatedSources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          )}
        </section>

        <details className="group space-y-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
            More
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 pt-2">
            <EntityAdmissionGrantsSection
              entityType={e.entity_type}
              entityId={entityId}
              grants={admissionGrants}
              grantsLoading={showInitialQuerySkeleton(grantsQ)}
              grantsError={grantsQ.error ? (grantsQ.error as Error) : null}
            />
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Record metadata</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Stable identifiers and reducer timestamps for this row — not business fields from the snapshot.
                </p>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-[200px_1fr]">
                  <IdentityRow label="entity_id" value={entityId} />
                  <IdentityRow label="entity_type" value={e.entity_type} />
                  <IdentityRow
                    label="schema_version"
                    value={e.schema_version ?? "—"}
                  />
                  <IdentityRow
                    label="merged_to_entity_id"
                    value={e.merged_to_entity_id ?? "—"}
                  />
                  <IdentityRow
                    label="merged_at"
                    value={e.merged_at ?? "—"}
                  />
                  <IdentityRow
                    label="last_observation_at"
                    value={e.last_observation_at ?? "—"}
                  />
                  <IdentityRow
                    label="computed_at"
                    value={e.computed_at ?? "—"}
                  />
                </dl>
              </CardContent>
            </Card>
            <AttributionCard
              provenance={latestObservationProvenance}
              title="Latest write attribution"
              description={
                latestObservationProvenance
                  ? "Agent identity recorded on the most recent observation for this entity."
                  : "The most recent observation does not carry agent attribution."
              }
            />
            {(() => {
              const candidateKey =
                typeof snapshot.turn_key === "string"
                  ? snapshot.turn_key
                  : (() => {
                      const sid = snapshot.session_id;
                      const tid = snapshot.turn_id;
                      if (typeof sid === "string" && typeof tid === "string") {
                        return `${sid}:${tid}`;
                      }
                      return null;
                    })();
              return candidateKey && e.entity_type !== "conversation_turn" ? (
                <TurnProvenanceCard turnKey={candidateKey} />
              ) : null;
            })()}
            {e.provenance && Object.keys(e.provenance).length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reducer provenance</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Field → observation_id map produced by the reducer. This
                    is <em>not</em> agent attribution; see the Latest write
                    attribution card above for the agent identity.
                  </p>
                </CardHeader>
                <CardContent>
                  <JsonViewer data={e.provenance} />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Graph neighborhood</CardTitle>
              </CardHeader>
              <CardContent>
                {showInitialQuerySkeleton(graph) ? (
                  <GraphAreaSkeleton />
                ) : graph.data ? (
                  <JsonViewer data={graph.data} defaultExpanded />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No graph data available.
                  </p>
                )}
                <div className="mt-3">
                  <Link to={`/graph?node=${encodeURIComponent(entityId)}`}>
                    <Button variant="outline" size="sm">
                      Open in graph explorer
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </details>
      </div>
    </PageShell>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  const looksLikeEntity = typeof value === "string" && value.startsWith("ent_");
  return (
    <>
      <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm">
        {looksLikeEntity ? (
          <EntityLink id={value} name={value} className="font-mono text-xs break-all" />
        ) : (
          value
        )}
      </dd>
    </>
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-3">
          <div className="col-start-1 row-start-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <Link
                to={`/sources/${encodeURIComponent(source.id)}`}
                className="min-w-0 truncate text-sm font-medium text-primary hover:underline"
                title={source.id}
              >
                {sourceDisplayTitle(source)}
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{sourceDisplaySummary(source)}</p>
          </div>
          <SourceInlinePreview source={source} />
          <div className="col-span-2 flex flex-wrap gap-2">
            {sourcePreviewChips(source).slice(0, 5).map((chip) => (
              <Badge
                key={`${source.id}-${chip}`}
                variant="secondary"
                className="font-normal text-muted-foreground"
              >
                {chip}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
