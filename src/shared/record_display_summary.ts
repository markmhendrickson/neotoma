/**
 * Human-readable display summaries for watch and other UIs (shared).
 * One short line per record type: sources, timeline_events, observations, etc.
 */

export interface RecordDisplayContext {
  /** Resolve entity id to display name (e.g. from getEntityDisplayName). */
  getEntityDisplayName?: (entityId: string) => string;
}

const MAX_SUMMARY_LEN = 48;

function str(row: Record<string, unknown>, key: string, maxLen = 36): string {
  const v = row[key];
  if (v == null) return "";
  const s = typeof v === "string" ? v : String(v);
  return s.trim().slice(0, maxLen);
}

function fallbackId(id: string, max = 12): string {
  return id.length > max ? id.slice(0, max) + "…" : id;
}

/**
 * Human-readable one-line summary for a watch/record row.
 * Uses context.getEntityDisplayName when provided for entity ids.
 */
export function getRecordDisplaySummary(
  table: string,
  row: Record<string, unknown>,
  context: RecordDisplayContext = {}
): string {
  const name = (id: string) =>
    context.getEntityDisplayName?.(id) ?? fallbackId(id);

  switch (table) {
    case "sources":
      return (
        str(row, "original_filename", MAX_SUMMARY_LEN) ||
        str(row, "file_name", MAX_SUMMARY_LEN) ||
        str(row, "mime_type", MAX_SUMMARY_LEN) ||
        "source"
      );

    case "entities":
      return `${str(row, "entity_type", 20)}: ${str(row, "canonical_name", MAX_SUMMARY_LEN - 22) || "—"}`;

    case "observations": {
      const entityId = str(row, "entity_id");
      const entityLabel = entityId ? name(entityId) : "";
      const entityType = str(row, "entity_type", 16);
      let fields = row.fields;
      if (typeof fields === "string") {
        try {
          fields = JSON.parse(fields) as Record<string, unknown>;
        } catch {
          fields = undefined;
        }
      }
      const fieldsObj = fields && typeof fields === "object" && !Array.isArray(fields) ? (fields as Record<string, unknown>) : undefined;
      const fromFields = fieldsObj ? str(fieldsObj, "title", 28) || str(fieldsObj, "name", 28) : "";
      const suffix = fromFields ? `: ${fromFields}` : ` for ${entityLabel}`;
      return `${entityType} obs${suffix}`.slice(0, MAX_SUMMARY_LEN + 20);
    }

    case "relationship_observations": {
      const rel = str(row, "relationship_type", 12);
      const src = name(str(row, "source_entity_id"));
      const tgt = name(str(row, "target_entity_id"));
      return `${rel} ${src} → ${tgt}`.slice(0, MAX_SUMMARY_LEN + 20);
    }

    case "timeline_events": {
      let meta = row.metadata;
      if (typeof meta === "string") {
        try {
          meta = JSON.parse(meta) as Record<string, unknown>;
        } catch {
          meta = undefined;
        }
      }
      const metaObj = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : undefined;
      const title =
        metaObj
          ? str(metaObj, "title", MAX_SUMMARY_LEN) || str(metaObj, "description", MAX_SUMMARY_LEN)
          : "";
      if (title) return title;
      const eventType = str(row, "event_type", 20);
      const ts = str(row, "event_timestamp", 24);
      return ts ? `${eventType} @ ${ts}` : eventType || "timeline event";
    }

    case "interpretations":
      return `${str(row, "status", 12)} (source: ${str(row, "source_id").slice(0, 8)}…)`;

    case "entity_snapshots": {
      const entityId = str(row, "entity_id");
      const label = entityId ? name(entityId) : "";
      const n = row.observation_count ?? 0;
      return `${str(row, "entity_type", 12)} ${label} (${n} obs)`.slice(
        0,
        MAX_SUMMARY_LEN + 12
      );
    }

    case "raw_fragments": {
      const et = str(row, "entity_type", 14);
      const key = str(row, "fragment_key", 14);
      const val = row.fragment_value;
      const valStr = val == null ? "" : typeof val === "string" ? val : JSON.stringify(val);
      const valPreview =
        valStr.length > 0 ? valStr.trim().slice(0, 14) + (valStr.length > 14 ? "…" : "") : "";
      return valPreview ? `${et}.${key}: ${valPreview}` : `${et}.${key}`;
    }

    case "entity_merges":
      return `${name(str(row, "from_entity_id"))} → ${name(str(row, "to_entity_id"))}`.slice(
        0,
        MAX_SUMMARY_LEN + 10
      );

    case "relationship_snapshots": {
      const rel = str(row, "relationship_type", 12);
      const src = name(str(row, "source_entity_id"));
      const tgt = name(str(row, "target_entity_id"));
      const n = row.observation_count ?? 0;
      return `${rel} ${src} → ${tgt} (${n} obs)`.slice(0, MAX_SUMMARY_LEN + 16);
    }

    default:
      return "";
  }
}
