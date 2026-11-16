import type { CorrectInput, DeprecatedCorrectInput } from "./types.js";

export type CorrectRequest = CorrectInput | DeprecatedCorrectInput;

/**
 * Raised, before any request is sent, when a caller asks for more than one
 * field to be corrected through an adapter that only issues single-field
 * corrections. Use the atomic `correct_transaction` tool for multi-field
 * updates.
 */
export class MultiFieldCorrectionError extends Error {
  readonly fields: string[];

  constructor(caller: string, fields: string[]) {
    super(
      `${caller} cannot apply ${fields.length} fields (${fields.join(", ")}) in one call. ` +
        "No request was sent and nothing was written. Send one single-field correct() per " +
        "field, or use correct_transaction for an atomic multi-field update."
    );
    this.name = "MultiFieldCorrectionError";
    this.fields = [...fields];
  }
}

export function isDeprecatedCorrectInput(input: CorrectRequest): input is DeprecatedCorrectInput {
  const record = input as unknown as Record<string, unknown>;
  const hasMap = "corrections" in record;
  const hasField = "field" in record;
  if (hasMap && hasField) {
    throw new TypeError(
      "correct() input must carry either `field` and `value` or the deprecated `corrections` map, not both"
    );
  }
  return hasMap;
}

export function assertValidCorrectionIdempotencyKey(
  value: unknown,
  caller: string
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${caller} requires a non-empty caller-supplied idempotency key`);
  }
}

/**
 * Execute a canonical correction unchanged, or convert the deprecated map form
 * with exactly one entry into the canonical single-field request using the
 * caller's idempotency key unchanged. A map with more than one field is
 * refused before any request is sent.
 */
export async function executeCorrectRequest(
  input: CorrectRequest,
  send: (request: CorrectInput) => Promise<unknown>
): Promise<unknown> {
  if (!isDeprecatedCorrectInput(input)) {
    return send(input);
  }

  const fields = Object.keys(input.corrections).sort();
  if (fields.length === 0) {
    throw new TypeError("Deprecated correct() corrections must contain at least one field");
  }
  if (fields.length > 1) {
    throw new MultiFieldCorrectionError("Deprecated correct()", fields);
  }

  assertValidCorrectionIdempotencyKey(input.idempotency_key, "Deprecated correct()");

  const { corrections, ...shared } = input;
  const field = fields[0];
  return send({ ...shared, field, value: corrections[field] });
}
