import { useState } from "react";
import { Link } from "react-router-dom";
import { FieldValue } from "@/components/shared/field_value";
import { InlineSkeleton } from "@/components/shared/query_status";
import { JsonViewer } from "@/components/shared/json_viewer";
import { AgentBadge } from "@/components/shared/agent_badge";
import { MarkdownBodySheet } from "@/components/shared/markdown_body_sheet";
import { Button } from "@/components/ui/button";
import { useFieldProvenance } from "@/hooks/use_entities";
import { shortId } from "@/lib/humanize";
import {
  filterSnapshotKeysForDisplay,
  snapshotFieldDisplayLabel,
} from "@/lib/snapshot_display";
import { isLikelyMarkdownFieldValue } from "@/lib/markdown_body";
import { orderedSnapshotKeys } from "@/lib/snapshot_ordering";
import type { EntitySchema, Observation, Source } from "@/types/api";
import { FileText, PanelRight, TriangleAlert } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";

interface SnapshotFieldListProps {
  entityId: string;
  snapshot: Record<string, unknown>;
  schema?: EntitySchema | null;
  /** Entity type for friendly labels and field filtering (e.g. hide redundant canonical_name on conversations). */
  entityType?: string | null;
  /**
   * When true, show developer details (raw keys, provenance panel by default,
   * schema/content hashes). In friendly mode a provenance icon reveals sources inline.
   */
  developerView?: boolean;
}

interface RawFragmentsFieldListProps {
  rawFragments: Record<string, unknown>;
  entityType?: string | null;
  developerView?: boolean;
}

const RAW_FRAGMENT_TOOLTIP =
  "Raw fragment: value stored outside this entity type's declared schema. It is preserved in Neotoma but not shown as a schema field above.";

/** Matches icon button height (h-7) so labels, values, and actions share one row band. */
const FIELD_ROW_BAND = "min-h-7";
const FIELD_ROW_VALUE_CLASS = "leading-7";

/** Declared-schema overflow fields; rendered below the snapshot field list. */
export function RawFragmentsFieldList({
  rawFragments,
  entityType,
  developerView,
}: RawFragmentsFieldListProps) {
  const keys = Object.keys(rawFragments).sort();
  if (keys.length === 0) return null;

  const labelClassName = developerView
    ? "font-mono text-xs text-purple-700"
    : "text-xs uppercase tracking-wide text-muted-foreground";

  return (
    <dl className="divide-y border-t">
      {keys.map((key) => (
        <div
          key={key}
          className="grid gap-1 py-2 sm:grid-cols-[180px_1fr] sm:items-start"
        >
          <dt className={cn("min-w-0", FIELD_ROW_BAND, "flex items-center")}>
            <div className={cn("break-words", FIELD_ROW_VALUE_CLASS, labelClassName)}>
              {developerView
                ? key
                : snapshotFieldDisplayLabel(key, entityType, developerView)}
            </div>
          </dt>
          <dd className="min-w-0">
            <div className={cn("flex items-start justify-between gap-2", FIELD_ROW_BAND)}>
              <div className="min-w-0 flex-1">
                <FieldValue
                  value={rawFragments[key]}
                  className={FIELD_ROW_VALUE_CLASS}
                />
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex h-7 w-7 shrink-0 cursor-default items-center justify-center text-amber-600 dark:text-amber-500"
                      aria-label={`Raw field: ${key}`}
                    >
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <p className="font-mono">{key}</p>
                    <p className="mt-1 text-muted-foreground">{RAW_FRAGMENT_TOOLTIP}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SnapshotFieldList({
  entityId,
  snapshot,
  schema,
  entityType,
  developerView,
}: SnapshotFieldListProps) {
  const schemaFieldOrder: string[] = schema?.schema_definition?.fields
    ? Object.keys(schema.schema_definition.fields)
    : schema?.field_names ?? [];
  const keys = filterSnapshotKeysForDisplay(
    orderedSnapshotKeys(snapshot, schemaFieldOrder),
    snapshot,
    entityType,
    developerView,
  );

  if (keys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Snapshot exists but has no fields yet. Check Timeline or run a snapshot
        recompute on the server if data should appear here.
      </p>
    );
  }

  return (
    <dl className="divide-y">
      {keys.map((key) => (
        <FieldRow
          key={key}
          entityId={entityId}
          fieldKey={key}
          value={snapshot[key]}
          schema={schema}
          entityType={entityType}
          developerView={developerView}
        />
      ))}
    </dl>
  );
}

function FieldRow({
  entityId,
  fieldKey,
  value,
  schema,
  entityType,
  developerView,
}: {
  entityId: string;
  fieldKey: string;
  value: unknown;
  schema?: EntitySchema | null;
  entityType?: string | null;
  developerView?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [markdownSheetOpen, setMarkdownSheetOpen] = useState(false);
  const provenance = useFieldProvenance(open ? entityId : undefined, open ? fieldKey : undefined);

  const fieldDef = schema?.schema_definition?.fields?.[fieldKey] as
    | { type?: string; description?: string }
    | undefined;
  const fieldSummary = schema?.field_summary?.[fieldKey] as { type?: string } | undefined;
  const typeHint = fieldDef?.type ?? fieldSummary?.type;

  const label = snapshotFieldDisplayLabel(fieldKey, entityType, developerView);
  const labelClassName = developerView
    ? "font-mono text-xs text-purple-700"
    : "text-xs uppercase tracking-wide text-muted-foreground";

  const showMarkdownSidebar = isLikelyMarkdownFieldValue(value);
  const hasFieldDescription = Boolean(fieldDef?.description && !developerView);

  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[180px_1fr] sm:items-start">
      <dt
        className={cn(
          "min-w-0",
          !hasFieldDescription && cn(FIELD_ROW_BAND, "flex items-center"),
        )}
      >
        <div
          className={cn(
            "break-words",
            !hasFieldDescription && FIELD_ROW_VALUE_CLASS,
            labelClassName,
          )}
        >
          {label}
        </div>
        {hasFieldDescription ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{fieldDef?.description}</div>
        ) : null}
      </dt>
      <dd className="min-w-0 space-y-1">
        <div className={cn("flex items-start justify-between gap-2", FIELD_ROW_BAND)}>
          <div className="min-w-0 flex-1">
            <FieldValue value={value} typeHint={typeHint} className={FIELD_ROW_VALUE_CLASS} />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {showMarkdownSidebar ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      aria-label="Open in sidebar"
                      onClick={() => {
                        window.setTimeout(() => setMarkdownSheetOpen(true), 0);
                      }}
                    >
                      <PanelRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in sidebar</TooltipContent>
                </Tooltip>
                <MarkdownBodySheet
                  open={markdownSheetOpen}
                  onOpenChange={setMarkdownSheetOpen}
                  title={label}
                  description={fieldDef?.description}
                  content={value as string}
                />
              </>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 shrink-0 text-muted-foreground",
                    open && "bg-muted text-foreground",
                  )}
                  onClick={() => setOpen((v) => !v)}
                  aria-label={open ? "Hide field sources" : "Show field sources"}
                  aria-pressed={open}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {open ? "Hide field sources" : "Show field sources"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {open ? (
          <div className="rounded border border-dashed bg-muted/30 p-2">
            {showInitialQuerySkeleton(provenance) ? (
              <InlineSkeleton className="h-3 w-40" />
            ) : provenance.data ? (
              <div className="space-y-1">
                {showBackgroundQueryRefresh(provenance) ? (
                  <p className="text-[11px] text-muted-foreground">Updating provenance…</p>
                ) : null}
                <FieldProvenanceSummary data={provenance.data} developerView={developerView} />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No provenance data.</span>
            )}
          </div>
        ) : null}
      </dd>
    </div>
  );
}

interface FieldProvenanceData {
  field?: string;
  entity_id?: string;
  observation_ids?: string[];
  observations?: Observation[];
  sources?: Source[];
}

/**
 * Human-readable summary of a field's provenance chain: which agent(s)
 * wrote it, from which source(s), and when. Falls back to the raw JSON in
 * developer view so we don't lose anything the backend returned.
 */
function FieldProvenanceSummary({
  data,
  developerView,
}: {
  data: unknown;
  developerView?: boolean;
}) {
  const payload = (data ?? {}) as FieldProvenanceData;
  const observations = payload.observations ?? [];
  const sourcesById = new Map(
    (payload.sources ?? []).map((s) => [s.id, s] as const)
  );

  if (observations.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No contributing observations found for this field.
      </span>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Contributing observations ({observations.length})
      </p>
      <ul className="space-y-1.5">
        {observations.map((obs) => {
          const source = obs.source_id ? sourcesById.get(obs.source_id) : undefined;
          return (
            <li
              key={obs.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
            >
              <AgentBadge provenance={obs.provenance ?? null} />
              {obs.observed_at ? (
                <span className="text-muted-foreground">
                  {formatDate(obs.observed_at)}
                </span>
              ) : null}
              {obs.source_id ? (
                <Link
                  to={`/sources/${encodeURIComponent(obs.source_id)}`}
                  className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] hover:bg-muted/70"
                  title={obs.source_id}
                >
                  {source?.original_filename
                    ? source.original_filename
                    : `source ${shortId(obs.source_id, 8)}`}
                </Link>
              ) : null}
              <span className="font-mono text-[10px] text-muted-foreground break-all">
                obs {shortId(obs.id, 8)}
              </span>
            </li>
          );
        })}
      </ul>
      {developerView ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            Raw provenance payload
          </summary>
          <div className="mt-1">
            <JsonViewer data={data} defaultExpanded />
          </div>
        </details>
      ) : null}
    </div>
  );
}
