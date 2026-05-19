/**
 * FU-2026-05-003: per-turn anchor sections.
 *
 * Renders one block per turn with deterministic anchor IDs `#msg-N`,
 * `#stored-N`, `#retrieved-N`, and `#issues-N` that the timeline sidebar
 * (and external deep-links) navigate to. The issue consent card surfaces
 * inline under `#issues-N` when the turn has pending issues.
 */

import { Link } from "react-router-dom";
import type {
  ConversationTurnEntityRef,
  ConversationTurnIndex,
  ConversationTurnIndexTurn,
} from "@/types/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TypeBadge } from "@/components/shared/type_badge";

function turnAnchorId(turnNumber: number, kind: "msg" | "stored" | "retrieved" | "issues") {
  return `${kind}-${turnNumber}`;
}

function EntityRefRow({ entity }: { entity: ConversationTurnEntityRef }) {
  const label = entity.canonical_name?.trim() || entity.entity_id;
  return (
    <li className="flex items-center justify-between gap-2 rounded border bg-card px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <TypeBadge type={entity.entity_type} humanize />
        <Link
          to={`/entities/${encodeURIComponent(entity.entity_id)}`}
          className="truncate font-medium hover:underline"
          title={label}
        >
          {label}
        </Link>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{entity.entity_id}</span>
    </li>
  );
}

function EntityList({
  entities,
  emptyMessage,
}: {
  entities: ConversationTurnEntityRef[];
  emptyMessage: string;
}) {
  if (entities.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {entities.map((entity) => (
        <EntityRefRow key={entity.entity_id} entity={entity} />
      ))}
    </ul>
  );
}

function IssueConsentCard({ issues }: { issues: ConversationTurnEntityRef[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
      <h4 className="mb-2 text-sm font-semibold">
        ⚠ {issues.length === 1 ? "1 issue" : `${issues.length} issues`} awaiting consent
      </h4>
      <p className="mb-3 text-xs text-muted-foreground">
        Auto-filed issues from this turn need explicit consent before they are shared externally.
        Review each issue and confirm or reject.
      </p>
      <ul className="space-y-1.5">
        {issues.map((issue) => (
          <EntityRefRow key={issue.entity_id} entity={issue} />
        ))}
      </ul>
    </div>
  );
}

function TurnAnchorBlock({ turn }: { turn: ConversationTurnIndexTurn }) {
  const role = turn.role.toLowerCase();
  return (
    <Card>
      <CardHeader id={turnAnchorId(turn.turn_number, "msg")} className="scroll-mt-20 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
              Turn {turn.turn_number}
            </span>
            <span className="text-xs text-muted-foreground">{role}</span>
            {turn.turn_key ? (
              <span className="font-mono text-[10px] text-muted-foreground" title={turn.turn_key}>
                {turn.turn_key}
              </span>
            ) : null}
          </div>
          <Link
            to={`/entities/${encodeURIComponent(turn.message_entity_id)}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            View message →
          </Link>
        </div>
        {turn.content_preview ? (
          <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
            {turn.content_preview}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <section
          id={turnAnchorId(turn.turn_number, "stored")}
          className="scroll-mt-20 space-y-2"
          aria-label={`Turn ${turn.turn_number} stored entities`}
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stored ({turn.stored.length})
          </h4>
          <EntityList entities={turn.stored} emptyMessage="No entities stored this turn." />
        </section>
        <section
          id={turnAnchorId(turn.turn_number, "retrieved")}
          className="scroll-mt-20 space-y-2"
          aria-label={`Turn ${turn.turn_number} retrieved entities`}
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Retrieved ({turn.retrieved.length})
          </h4>
          <EntityList entities={turn.retrieved} emptyMessage="No entities retrieved this turn." />
        </section>
        <section
          id={turnAnchorId(turn.turn_number, "issues")}
          className="scroll-mt-20 space-y-2"
          aria-label={`Turn ${turn.turn_number} issues`}
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Issues ({turn.issues.length})
          </h4>
          <IssueConsentCard issues={turn.issues} />
          {turn.issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">No issues surfaced this turn.</p>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

export function TurnAnchorSections({ index }: { index: ConversationTurnIndex }) {
  if (index.turns.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No turns recorded yet.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {index.turns.map((turn) => (
        <TurnAnchorBlock key={turn.message_entity_id} turn={turn} />
      ))}
    </div>
  );
}
