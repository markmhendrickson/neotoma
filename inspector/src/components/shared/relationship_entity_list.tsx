import { Link } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { shortId } from "@/lib/humanize";
import type { DirectedRelationshipRow } from "@/lib/relationship_panel_groups";

export function RelationshipEntityList({
  rows,
  selfId,
  developerView,
}: {
  rows: DirectedRelationshipRow[];
  selfId: string;
  developerView?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No related entities in this group yet. Linked entities appear here as
        relationships are created.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded border">
      {rows.map((row) => (
        <RelationshipEntityListItem
          key={row.rel.relationship_key}
          row={row}
          selfId={selfId}
          developerView={developerView}
        />
      ))}
    </ul>
  );
}

function RelationshipEntityListItem({
  row,
  selfId,
  developerView,
}: {
  row: DirectedRelationshipRow;
  selfId: string;
  developerView?: boolean;
}) {
  const otherLabel =
    row.otherName || (row.otherId ? shortId(row.otherId, 10) : "Unknown entity");
  const lastObserved = row.otherLastObservedAt ?? row.rel.last_observation_at ?? null;

  return (
    <li className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {row.otherId ? (
          <Link
            to={`/entities/${encodeURIComponent(row.otherId)}`}
            className="block min-w-0 max-w-full truncate text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title={row.otherId}
          >
            {otherLabel}
          </Link>
        ) : (
          <span className="block min-w-0 max-w-full truncate text-sm font-medium">{otherLabel}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        {lastObserved ? (
          <span title="Last observed">{formatDate(lastObserved)}</span>
        ) : null}
        {developerView ? (
          <span className="font-mono" title={row.rel.relationship_key}>
            {shortId(row.rel.relationship_key, 10)}
          </span>
        ) : null}
        {developerView ? (
          <span className="font-mono" title={selfId}>
            self {shortId(selfId, 6)}
          </span>
        ) : null}
      </div>
    </li>
  );
}
