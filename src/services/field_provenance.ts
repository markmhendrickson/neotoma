/** Shared, complete, field-scoped provenance for the existing HTTP/MCP operation. */
import { db } from "../db.js";
import type { components } from "../shared/openapi_types.js";
import type { AttributionProvenance } from "../crypto/agent_identity.js";
import { getOwnedSource } from "./scoped_reads.js";
import { readDataOriginFromProvenance } from "./provenance_data_origin.js";

export type FieldProvenanceResponse = components["schemas"]["FieldProvenanceResponse"];
type ProjectedObservation = components["schemas"]["FieldProvenanceObservation"];
type ProjectedSource = components["schemas"]["FieldProvenanceSource"];
type Row = Record<string, unknown>;

export class FieldProvenanceError extends Error {
  readonly statusCode: 404 | 500;

  constructor(
    readonly code: "RESOURCE_NOT_FOUND" | "PROVENANCE_INTEGRITY_ERROR" | "DB_QUERY_FAILED",
    readonly entityId: string,
    readonly field: string,
    readonly reference?: { kind: "observation" | "source"; id: string }
  ) {
    const context = `entity '${entityId}', field '${field}'`;
    super(
      code === "RESOURCE_NOT_FOUND"
        ? `Field '${field}' not found in provenance for entity '${entityId}'.`
        : reference
          ? `Provenance for ${context} references unavailable ${reference.kind} '${reference.id}'.`
          : `Failed to query provenance for ${context}.`
    );
    this.name = "FieldProvenanceError";
    this.statusCode = code === "RESOURCE_NOT_FOUND" ? 404 : 500;
  }

  toErrorEnvelope(): components["schemas"]["ErrorEnvelope"] {
    return {
      error_code: this.code,
      message: this.message,
      details: {
        entity_id: this.entityId,
        field: this.field,
        ...(this.reference
          ? { reference_kind: this.reference.kind, reference_id: this.reference.id }
          : {}),
        hint:
          this.code === "RESOURCE_NOT_FOUND"
            ? "Read the entity snapshot and select a field with recorded provenance."
            : this.code === "PROVENANCE_INTEGRITY_ERROR"
              ? "Repair the referenced provenance before retrying; no partial chain is returned."
              : "Retry the provenance read after the database is available.",
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// Do not copy arbitrary provenance: conditional-operation receipts can contain
// unrelated fields. These are the existing write-attribution keys only.
const ATTRIBUTION_KEYS: ReadonlyArray<keyof AttributionProvenance> = [
  "agent_public_key",
  "agent_thumbprint",
  "agent_algorithm",
  "agent_sub",
  "agent_iss",
  "client_name",
  "client_version",
  "connection_id",
  "attribution_tier",
  "attributed_at",
  "external_actor",
  "authenticated_actor_id",
];

/** The caller supplies the user resolved by the existing authenticated entrance. */
export async function getFieldProvenance(
  entityId: string,
  field: string,
  userId: string
): Promise<FieldProvenanceResponse> {
  const integrity = (kind: "observation" | "source", id: string) =>
    new FieldProvenanceError("PROVENANCE_INTEGRITY_ERROR", entityId, field, { kind, id });
  try {
    const { data: snapshot, error: snapshotError } = await db
      .from("entity_snapshots")
      .select("snapshot, provenance")
      .eq("entity_id", entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (snapshotError) throw new FieldProvenanceError("DB_QUERY_FAILED", entityId, field);
    const value = snapshot?.snapshot as Row | undefined;
    const provenance = snapshot?.provenance as Row | undefined;
    if (
      !value ||
      !Object.hasOwn(value, field) ||
      !provenance ||
      !Object.hasOwn(provenance, field)
    ) {
      throw new FieldProvenanceError("RESOURCE_NOT_FOUND", entityId, field);
    }
    const rawIds = provenance[field];
    if (typeof rawIds !== "string") throw integrity("observation", String(rawIds));
    const ids = [
      ...new Set(
        rawIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ].sort();
    if (!ids.length) throw integrity("observation", rawIds);

    const { data, error } = await db
      .from("observations")
      .select(
        "id, entity_id, entity_type, schema_version, source_id, interpretation_id, observed_at, created_at, specificity_score, source_priority, observation_source, idempotency_key, fields, provenance"
      )
      .in("id", ids)
      .eq("user_id", userId);
    if (error) throw new FieldProvenanceError("DB_QUERY_FAILED", entityId, field);
    const rows = new Map(((data ?? []) as Row[]).map((row) => [row.id, row]));
    const observations: ProjectedObservation[] = ids.map((id) => {
      const row = rows.get(id);
      const fields = row?.fields as Row | undefined;
      if (
        !row ||
        row.entity_id !== entityId ||
        !fields ||
        typeof fields !== "object" ||
        Array.isArray(fields) ||
        !Object.hasOwn(fields, field) ||
        typeof row.observed_at !== "string" ||
        !Number.isFinite(Date.parse(row.observed_at))
      ) {
        throw integrity("observation", id);
      }
      const storedProvenance = row.provenance as Row | null;
      const attribution: Row = {};
      for (const key of ATTRIBUTION_KEYS) {
        if (storedProvenance && Object.hasOwn(storedProvenance, key)) {
          attribution[key] = storedProvenance[key];
        }
      }
      const dataOrigin = readDataOriginFromProvenance(storedProvenance);
      if (dataOrigin) attribution.data_origin = dataOrigin;
      return {
        id,
        entity_id: entityId,
        entity_type: row.entity_type as string,
        schema_version: row.schema_version as string,
        source_id: (row.source_id ?? null) as string | null,
        interpretation_id: (row.interpretation_id ?? null) as string | null,
        observed_at: row.observed_at as string,
        created_at: (row.created_at ?? null) as string | null,
        specificity_score: (row.specificity_score ?? null) as number | null,
        source_priority: row.source_priority as number,
        observation_source: (row.observation_source ??
          null) as ProjectedObservation["observation_source"],
        idempotency_key: (row.idempotency_key ?? null) as string | null,
        fields: { [field]: fields[field] },
        ...(Object.keys(attribution).length ? { provenance: attribution } : {}),
        ...(dataOrigin ? { data_origin: dataOrigin } : {}),
      };
    });
    observations.sort((a, b) => {
      const time = Date.parse(b.observed_at) - Date.parse(a.observed_at);
      return time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });

    const sourceIds = [
      ...new Set(observations.flatMap((row) => (row.source_id === null ? [] : [row.source_id]))),
    ].sort();
    const sources: ProjectedSource[] = [];
    for (const id of sourceIds) {
      const source = await getOwnedSource<Row>(
        id,
        userId,
        "id, mime_type, content_hash, file_size, created_at"
      );
      if (!source) throw integrity("source", id);
      sources.push({
        id,
        mime_type: (source.mime_type ?? null) as string | null,
        content_hash: (source.content_hash ?? null) as string | null,
        file_size: (source.file_size ?? null) as number | null,
        created_at: (source.created_at ?? null) as string | null,
      });
    }
    const representative = observations[0];
    return {
      field,
      entity_id: entityId,
      value: value[field],
      observation_ids: observations.map((row) => row.id),
      observations,
      sources,
      source_observation: representative,
      source: sources.find((source) => source.id === representative.source_id) ?? null,
      observed_at: representative.observed_at,
    };
  } catch (error) {
    if (error instanceof FieldProvenanceError) throw error;
    throw new FieldProvenanceError("DB_QUERY_FAILED", entityId, field);
  }
}
