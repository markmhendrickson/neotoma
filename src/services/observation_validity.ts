/** State-validity metadata is separate from assertion and row-insertion clocks. */
import { z } from "zod";

export interface ObservationValidity {
  valid_from?: string | null;
  valid_to?: string | null;
}

const instant = z.string().datetime({ offset: true });

export class ObservationValidityError extends Error {
  readonly code = "VALIDATION_INVALID_FORMAT";
  constructor(readonly field: "valid_from" | "valid_to" | "valid_at") {
    super(
      `Invalid ${field}: supply a supported RFC3339 instant or null and a nonempty validity interval.`
    );
    this.name = "ObservationValidityError";
  }
}

/** Preserve arbitrary fractional precision instead of silently rounding through Date. */
export function canonicalValidityInstant(
  value: string,
  field: "valid_from" | "valid_to" | "valid_at"
): string {
  const input = typeof value === "string" ? value.replace("t", "T").replace(/z$/, "Z") : value;
  if (!instant.safeParse(input).success) throw new ObservationValidityError(field);
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) throw new ObservationValidityError(field);
  const utc = parsed.toISOString();
  // Offsets near the RFC3339 year limits must not produce a truncated expanded year.
  if (!/^\d{4}-/.test(utc)) throw new ObservationValidityError(field);
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(input)?.[1] ?? "";
  const canonicalFraction = fraction.replace(/0+$/, "").padEnd(3, "0");
  return `${utc.slice(0, 19)}.${canonicalFraction}Z`;
}

/** Both inputs are canonical UTC strings; compare fractions without precision loss. */
function compareInstants(a: string, b: string): number {
  const as = a.slice(0, 19);
  const bs = b.slice(0, 19);
  const seconds = as === bs ? 0 : as < bs ? -1 : 1;
  if (seconds !== 0) return seconds;
  const af = a.slice(20, -1);
  const bf = b.slice(20, -1);
  const width = Math.max(af.length, bf.length);
  const left = af.padEnd(width, "0");
  const right = bf.padEnd(width, "0");
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * Omitted columns stay omitted, preserving legacy row/identity bytes. Explicit
 * null is retained. Ordinary rows use their own observation clock as the default
 * lower bound; protected occurrence inheritance is deliberately not implemented here.
 */
export function normalizeObservationValidity(
  input: ObservationValidity,
  observedAt: string
): ObservationValidity {
  const output: ObservationValidity = {};
  for (const field of ["valid_from", "valid_to"] as const) {
    if (input[field] !== undefined) {
      output[field] = input[field] === null ? null : canonicalValidityInstant(input[field], field);
    }
  }
  if (typeof output.valid_to === "string") {
    const start = output.valid_from ?? canonicalValidityInstant(observedAt, "valid_from");
    if (compareInstants(start, output.valid_to) >= 0) {
      throw new ObservationValidityError("valid_to");
    }
  }
  return output;
}

/** Apply only to factual assertions, after lifecycle authority and knowledge selection. */
export function observationIsValidAt(
  row: ObservationValidity & { observed_at: string },
  canonicalAt: string
): boolean {
  const start = canonicalValidityInstant(row.valid_from ?? row.observed_at, "valid_from");
  const end = row.valid_to == null ? null : canonicalValidityInstant(row.valid_to, "valid_to");
  if (end !== null && compareInstants(start, end) >= 0)
    throw new ObservationValidityError("valid_to");
  return (
    compareInstants(start, canonicalAt) <= 0 &&
    (end === null || compareInstants(canonicalAt, end) < 0)
  );
}
