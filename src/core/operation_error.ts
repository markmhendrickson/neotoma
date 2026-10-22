import type { components } from "../shared/openapi_types.js";

export type OperationErrorEnvelope = components["schemas"]["ErrorEnvelope"];

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
