import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTurn } from "@/hooks/use_turns";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";

export interface TurnProvenanceCardProps {
  turnKey: string;
}

/**
 * Renders a compact "Turn provenance" card on entity detail pages
 * for entities that carry a `turn_key` (e.g. conversation_message,
 * tool_invocation, tool_invocation_failure, context_event). Surfaces
 * harness, hook events, and core counters with a link to the full
 * `/turns/:turnKey` view.
 */
export function TurnProvenanceCard({ turnKey }: TurnProvenanceCardProps) {
  const turn = useTurn(turnKey);
  const data = turn.data ?? null;

  if (showInitialQuerySkeleton(turn)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Turn provenance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading turn…</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Turn provenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            No <code>conversation_turn</code> recorded for{" "}
            <span className="font-mono text-xs">{turnKey}</span>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const counters: Array<[string, number]> = [
    ["Hook events", data.hook_summary.hook_event_count],
    ["Tool invocations", data.tool_invocation_count],
    ["store_structured", data.store_structured_calls],
    ["retrieve_*", data.retrieve_calls],
    ["Stored", data.hook_summary.stored_entity_count],
    ["Retrieved", data.hook_summary.retrieved_entity_count],
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Turn provenance</CardTitle>
          {showBackgroundQueryRefresh(turn) ? (
            <span className="text-xs text-muted-foreground">Updating…</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Hook participation accreted onto the matching{" "}
          <code>conversation_turn</code>.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Turn key</dt>
          <dd className="break-all font-mono text-xs">
            <Link
              to={`/turns/${encodeURIComponent(data.turn_key ?? turnKey)}`}
              className="hover:underline"
            >
              {data.turn_key ?? turnKey}
            </Link>
          </dd>
          {data.harness ? (
            <>
              <dt className="text-muted-foreground">Harness</dt>
              <dd>{data.harness}</dd>
            </>
          ) : null}
          {data.status ? (
            <>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{data.status}</dd>
            </>
          ) : null}
          {data.activity_at ? (
            <>
              <dt className="text-muted-foreground">Last activity</dt>
              <dd>
                <LiveRelativeTime iso={data.activity_at} />
              </dd>
            </>
          ) : null}
        </dl>

        {data.hook_events.length > 0 ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Hook events
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {data.hook_events.map((evt, i) => (
                <span
                  key={`${evt}-${i}`}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs"
                >
                  {evt}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {counters.map(([label, value]) => (
            <div
              key={label}
              className="rounded border bg-background px-2.5 py-1.5"
            >
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="text-sm font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        <Link
          to={`/turns/${encodeURIComponent(data.turn_key ?? turnKey)}`}
          className="text-xs text-primary hover:underline"
        >
          View full turn detail →
        </Link>
      </CardContent>
    </Card>
  );
}
