import { db } from "../db.js";

type SourceRow = {
  id: string;
  original_filename?: string | null;
  mime_type?: string | null;
  provenance?: Record<string, unknown> | null;
  idempotency_key?: string | null;
};

const SOURCE_FILE_FIELD_KEYS = [
  "data_source",
  "source_file",
  "import_source_file",
  "assets_sheet_source_file",
  "savings_sheet_source_file",
  "statement_pdf_path",
  "statement_source_kind",
];

/**
 * Try to derive a descriptive label from the observation's own fields (entity data).
 * Many finance import scripts stash the original filename in `source_file` etc.
 */
function labelFromObservationFields(fields: unknown): string | null {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const f = fields as Record<string, unknown>;
  for (const key of SOURCE_FILE_FIELD_KEYS) {
    const val = f[key];
    if (typeof val === "string" && val.trim()) {
      const basename = val.includes("/") ? val.split("/").pop()! : val;
      return basename.trim() || null;
    }
  }
  const ok = f.observation_kind;
  if (typeof ok === "string" && ok.trim()) return ok.trim();
  return null;
}

/**
 * Derive a short string for API consumers (e.g. finances UI) from a `sources` row.
 * Observations store `source_id`; this fills `source` for list responses.
 */
export function sourceRowToLabel(
  src: SourceRow | undefined,
  observationFields?: unknown
): string | null {
  if (!src) return null;
  const fn = typeof src.original_filename === "string" ? src.original_filename.trim() : "";
  if (fn) return fn;

  const fromFields = labelFromObservationFields(observationFields);
  if (fromFields) return fromFields;

  const idemKey = typeof src.idempotency_key === "string" ? src.idempotency_key.trim() : "";
  if (idemKey) return idemKey;

  const prov =
    src.provenance && typeof src.provenance === "object" && !Array.isArray(src.provenance)
      ? src.provenance
      : {};
  const um = typeof prov.upload_method === "string" ? prov.upload_method : "";
  if (um === "api_store" || um === "mcp_store") return "neotoma_store";
  if (um) return um.replace(/^api_/, "") || um;
  if (src.mime_type === "application/json") return "neotoma_store";
  return "imported_payload";
}

/**
 * Attaches `source` (human-readable) to each observation when missing, using `sources` by `source_id`.
 * Also inspects observation fields for file provenance when the sources row has no filename.
 */
export async function attachSourceLabelsToObservations(
  userId: string,
  observations: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (!observations.length) return observations;

  const sourceIds = [
    ...new Set(
      observations
        .map((o) => o.source_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const byId = new Map<string, SourceRow>();
  if (sourceIds.length > 0) {
    const { data: sources, error } = await db
      .from("sources")
      .select("id, original_filename, mime_type, provenance, idempotency_key")
      .eq("user_id", userId)
      .in("id", sourceIds);
    if (error) throw error;
    for (const s of sources || []) {
      const row = s as SourceRow;
      if (row?.id) byId.set(row.id, row);
    }
  }

  return observations.map((o) => {
    const existing = typeof o.source === "string" && o.source.trim() ? o.source.trim() : null;
    if (existing) return { ...o, source: existing };
    const sid = typeof o.source_id === "string" ? o.source_id : null;
    if (!sid) {
      const fallback = labelFromObservationFields(o.fields);
      return { ...o, source: fallback };
    }
    return { ...o, source: sourceRowToLabel(byId.get(sid), o.fields) };
  });
}
