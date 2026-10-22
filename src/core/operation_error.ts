import type { components } from "../shared/openapi_types.js";

export type OperationErrorEnvelope = components["schemas"]["ErrorEnvelope"] & {
  error_code: string;
  message: string;
};

/** Domain failure only. Transports retain responsibility for their wire representation. */
export class OperationError extends Error {
  readonly statusCode: number;
  private readonly envelope: OperationErrorEnvelope;
  constructor(
    errorCode: string,
    message: string,
    options: { statusCode: number; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = "OperationError";
    this.statusCode = options.statusCode;
    this.envelope = {
      error_code: errorCode,
      message,
      ...(options.details ? { details: options.details } : {}),
    };
  }
  toErrorEnvelope(): OperationErrorEnvelope {
    return structuredClone(this.envelope);
  }
}

/** Canonical projection of the existing rejected query-field constraint. */
export function invalidQueryFieldOperationError(): OperationError {
  const guidance =
    "Query field names (sort_by / snapshot_filters keys) must be bare identifiers matching ^[A-Za-z_][A-Za-z0-9_]*$.";
  return new OperationError("INVALID_QUERY_FIELD", "Invalid query field name.", {
    statusCode: 400,
    details: { detail: guidance, hint: guidance },
  });
}
