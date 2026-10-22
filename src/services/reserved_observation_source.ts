/**
 * Reject client attempts to claim correction authority on the generic
 * store / store_structured write path (#2033).
 *
 * `observation_source: "correction"` and `source_priority: 1000` are reserved
 * for `createCorrection` (and lifecycle deletion/restore, which never goes
 * through this guard). Spoofed claims must 4xx with no row persisted —
 * reject-not-strip, not silent downgrade.
 */

export const RESERVED_OBSERVATION_SOURCE_CODE = "RESERVED_OBSERVATION_SOURCE" as const;

export type ReservedObservationSourceField = "observation_source" | "source_priority";

export class ReservedObservationSourceError extends Error {
  readonly code = RESERVED_OBSERVATION_SOURCE_CODE;
  readonly field: ReservedObservationSourceField;
  readonly rejected_value: unknown;
  readonly hint: string;

  constructor(params: { field: ReservedObservationSourceField; value: unknown }) {
    const message =
      params.field === "observation_source"
        ? `observation_source: '${params.value}' is reserved — only the correct() operation may set it. Use correct() instead of store() to make an authoritative field change.`
        : `source_priority: ${params.value} is reserved — only the correct() operation (and server lifecycle paths) may set it. Use correct({ entity_id, field, value }) for authoritative field changes.`;
    super(message);
    this.name = "ReservedObservationSourceError";
    this.field = params.field;
    this.rejected_value = params.value;
    this.hint =
      "Call correct({ entity_id, field, value }). Since #2033, store()/store_structured() reject reserved correction authority instead of silently accepting it.";
  }

  toErrorEnvelope(): {
    error_code: typeof RESERVED_OBSERVATION_SOURCE_CODE;
    message: string;
    details: {
      hint: string;
      field: ReservedObservationSourceField;
      rejected_value: unknown;
    };
    timestamp: string;
  } {
    return {
      error_code: this.code,
      message: this.message,
      details: {
        hint: this.hint,
        field: this.field,
        rejected_value: this.rejected_value,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Throw when a generic store caller claims correction authority.
 * Call after Zod parse, before any observation row is written.
 */
export function assertClientObservationSourceAllowed(params: {
  observationSource?: string | null;
  sourcePriority?: number | null;
}): void {
  if (params.observationSource === "correction") {
    throw new ReservedObservationSourceError({
      field: "observation_source",
      value: params.observationSource,
    });
  }
  if (params.sourcePriority === 1000) {
    throw new ReservedObservationSourceError({
      field: "source_priority",
      value: params.sourcePriority,
    });
  }
}
