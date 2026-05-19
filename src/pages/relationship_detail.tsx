import { useParams } from "react-router-dom";
import { useRelationshipSnapshot } from "@/hooks/use_relationships";
import { useDeleteRelationship, useRestoreRelationship } from "@/hooks/use_mutations";
import { PageShell } from "@/components/layout/page_shell";
import { DetailPageSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntityLink } from "@/components/shared/entity_link";
import { JsonViewer } from "@/components/shared/json_viewer";
import { AttributionCard } from "@/components/shared/attribution_card";
import { AgentBadge } from "@/components/shared/agent_badge";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { toast } from "sonner";
import { Trash2, RotateCcw } from "lucide-react";
import { PinPrimitiveButton } from "@/components/shared/pin_primitive_button";

export default function RelationshipDetailPage() {
  const { key } = useParams<{ key: string }>();
  const parts = key?.split(":") ?? [];
  const [relType, sourceId, targetId] = parts.length >= 3 ? [parts[0]!, parts[1]!, parts.slice(2).join(":")] : [undefined, undefined, undefined];

  const snapshot = useRelationshipSnapshot(relType, sourceId, targetId);
  const deleteMut = useDeleteRelationship();
  const restoreMut = useRestoreRelationship();

  const s = snapshot.data?.snapshot;

  if (showInitialQuerySkeleton(snapshot))
    return (
      <PageShell title="Loading…">
        <DetailPageSkeleton />
      </PageShell>
    );
  if (snapshot.error)
    return (
      <PageShell title="Error">
        <QueryErrorAlert title="Could not load relationship">{snapshot.error.message}</QueryErrorAlert>
      </PageShell>
    );
  if (!s)
    return (
      <PageShell title="Not Found">
        <div className="text-muted-foreground">Relationship not found.</div>
      </PageShell>
    );

  return (
    <PageShell
      title={`${s.relationship_type}`}
      description={`${s.source_entity_id} → ${s.target_entity_id}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showBackgroundQueryRefresh(snapshot) ? <QueryRefreshIndicator /> : null}
          {key ? (
            <PinPrimitiveButton
              kind="relationship"
              href={`/relationships/${encodeURIComponent(key)}`}
              label={s.relationship_type}
              subtitle={`${s.source_entity_id} → ${s.target_entity_id}`}
            />
          ) : null}
          <ConfirmDialog
            trigger={<Button variant="outline" size="sm"><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>}
            title="Delete Relationship"
            description="Soft-delete this relationship? This is reversible."
            confirmLabel="Delete"
            variant="destructive"
            showReason
            onConfirm={(reason) =>
              deleteMut.mutate(
                { type: s.relationship_type, source: s.source_entity_id, target: s.target_entity_id, reason },
                { onSuccess: () => toast.success("Relationship deleted") }
              )
            }
          />
          <ConfirmDialog
            trigger={<Button variant="outline" size="sm"><RotateCcw className="h-3 w-3 mr-1" /> Restore</Button>}
            title="Restore Relationship"
            description="Restore this relationship?"
            confirmLabel="Restore"
            showReason
            onConfirm={(reason) =>
              restoreMut.mutate(
                { type: s.relationship_type, source: s.source_entity_id, target: s.target_entity_id, reason },
                { onSuccess: () => toast.success("Relationship restored") }
              )
            }
          />
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-mono">{s.relationship_type}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Source</span><EntityLink id={s.source_entity_id} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Target</span><EntityLink id={s.target_entity_id} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Observations</span><span>{s.observation_count}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Computed</span><span>{formatDate(s.computed_at)}</span></div>
          </CardContent>
        </Card>

        <AttributionCard
          provenance={(s.agent_attribution ?? null) as Record<string, unknown> | null}
          title="Agent attribution"
          description="Agent identity from the most recent contributing relationship observation."
        />
      </div>

      {s.snapshot && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-base">Snapshot</CardTitle></CardHeader>
          <CardContent><JsonViewer data={s.snapshot} defaultExpanded /></CardContent>
        </Card>
      )}

      {snapshot.data?.observations && snapshot.data.observations.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-base">Contributing observations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {snapshot.data.observations.map((obs, i) => (
                <div key={obs.id ?? i} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <AgentBadge provenance={obs.provenance ?? null} />
                      {obs.observed_at ? (
                        <span className="text-muted-foreground">
                          {formatDate(obs.observed_at)}
                        </span>
                      ) : null}
                      {typeof obs.source_priority === "number" ? (
                        <span className="text-muted-foreground">
                          priority {obs.source_priority}
                        </span>
                      ) : null}
                    </div>
                    {obs.id ? (
                      <span className="font-mono text-[10px] text-muted-foreground break-all">
                        {obs.id}
                      </span>
                    ) : null}
                  </div>
                  <JsonViewer data={obs} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {s.provenance && Object.keys(s.provenance).length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Reducer provenance</CardTitle>
            <p className="text-xs text-muted-foreground">
              Field → observation_id map produced by the relationship reducer.
              This is <em>not</em> agent attribution; see the Agent attribution
              card above.
            </p>
          </CardHeader>
          <CardContent><JsonViewer data={s.provenance} defaultExpanded /></CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
