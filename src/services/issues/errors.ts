/**
 * Structured errors raised by the Issues subsystem.
 *
 * Carrying typed errors (rather than `new Error("…")`) lets the HTTP layer
 * convert them into rich `ErrorEnvelope` payloads with stable `error_code`s
 * and structured hints, so MCP clients and CLI users see the same recovery
 * guidance without parsing free-form messages.
 */

export interface IssueValidationDetails {
  /** Stable error code for callers. */
  code: string;
  /** Free-form human-readable message (also used as Error.message). */
  message: string;
  /** Names of fields the caller should populate to retry. */
  required_fields?: string[];
  /** Acceptable alternatives the caller can supply ("at least one of"). */
  acceptable_field_groups?: string[][];
  /** A short remediation tip rendered in `details.hint`. */
  hint?: string;
  /** Free-form additional metadata (kept under `details.extra`). */
  extra?: Record<string, unknown>;
}

export interface IssueTransportDetails {
  /** Stable error code for callers. */
  code: string;
  /** Free-form human-readable message (also used as Error.message). */
  message: string;
  /** Suggested HTTP status when surfaced through the API. */
  status?: number;
  /** A short remediation tip rendered in `details.hint`. */
  hint?: string;
  /** Free-form additional metadata (kept under `details.extra`). */
  extra?: Record<string, unknown>;
}

export class IssueValidationError extends Error {
  public readonly code: string;
  public readonly required_fields?: string[];
  public readonly acceptable_field_groups?: string[][];
  public readonly hint?: string;
  public readonly extra?: Record<string, unknown>;

  constructor(details: IssueValidationDetails) {
    super(details.message);
    this.name = "IssueValidationError";
    this.code = details.code;
    this.required_fields = details.required_fields;
    this.acceptable_field_groups = details.acceptable_field_groups;
    this.hint = details.hint;
    this.extra = details.extra;
  }

  toErrorEnvelopeDetails(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (this.required_fields) out.required_fields = this.required_fields;
    if (this.acceptable_field_groups) out.acceptable_field_groups = this.acceptable_field_groups;
    if (this.hint) out.hint = this.hint;
    if (this.extra) out.extra = this.extra;
    return out;
  }
}

export class IssueTransportError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly hint?: string;
  public readonly extra?: Record<string, unknown>;

  constructor(details: IssueTransportDetails) {
    super(details.message);
    this.name = "IssueTransportError";
    this.code = details.code;
    this.status = details.status ?? 502;
    this.hint = details.hint;
    this.extra = details.extra;
  }

  toErrorEnvelopeDetails(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (this.hint) out.hint = this.hint;
    if (this.extra) out.extra = this.extra;
    return out;
  }
}

/**
 * Type guard for the HTTP error catch path.
 */
export function isIssueValidationError(value: unknown): value is IssueValidationError {
  return value instanceof IssueValidationError;
}

export function isIssueTransportError(value: unknown): value is IssueTransportError {
  return value instanceof IssueTransportError;
}
