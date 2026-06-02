import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink } from "lucide-react";
import { TypeBadge } from "@/components/shared/type_badge";
import { RelationshipEntityList } from "@/components/shared/relationship_entity_list";
import {
  buildDirectedRelationshipRows,
  groupRelationshipRowsByType,
  type DirectedRelationshipRow,
} from "@/lib/relationship_panel_groups";
import { entityRelationshipSubpageHref } from "@/lib/entity_relationship_routes";
import { humanizeRelationshipType } from "@/lib/humanize";
import type { EntityRelationshipsResponse } from "@/types/api";

interface RelationshipPanelProps {
  entityId?: string;
  data?: EntityRelationshipsResponse;
  rows?: DirectedRelationshipRow[];
  getSubpageHref?: (relationshipType: string, relatedEntityType: string) => string | null;
  developerView?: boolean;
}

export function RelationshipPanel({
  entityId = "",
  data,
  rows: rowsProp,
  getSubpageHref,
  developerView,
}: RelationshipPanelProps) {
  const rows = useMemo(
    () => rowsProp ?? buildDirectedRelationshipRows(data),
    [rowsProp, data],
  );
  const groups = useMemo(() => groupRelationshipRowsByType(rows), [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No relationships yet.</p>;
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.relationshipType}>
          <h3 className="mb-3 text-sm font-semibold">
            {humanizeRelationshipType(group.relationshipType)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {group.totalCount}
            </span>
          </h3>
          <div className="space-y-2">
            {group.entityTypeGroups.map((typeGroup) => {
              const subpageHref =
                typeGroup.entityType !== "unknown"
                  ? (getSubpageHref?.(group.relationshipType, typeGroup.entityType) ??
                    (entityId
                      ? entityRelationshipSubpageHref(
                          entityId,
                          group.relationshipType,
                          typeGroup.entityType,
                        )
                      : null))
                  : null;
              return (
                <details
                  key={`${group.relationshipType}:${typeGroup.entityType}`}
                  className="group rounded border"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                    {typeGroup.entityType !== "unknown" ? (
                      <TypeBadge
                        type={typeGroup.entityType}
                        label={typeGroup.displayLabel}
                        humanize
                        className="shrink-0"
                      />
                    ) : (
                      <span className="text-muted-foreground">{typeGroup.displayLabel}</span>
                    )}
                    <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
                      {subpageHref ? (
                        <Link
                          to={subpageHref}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          View all
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      ) : null}
                      <span>{typeGroup.rows.length}</span>
                    </span>
                  </summary>
                  <div className="border-t px-3 py-2">
                    <RelationshipEntityList
                      rows={typeGroup.rows}
                      selfId={entityId}
                      developerView={developerView}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
