import type { CorrectInput, DeprecatedCorrectInput } from "./types.js";

export type CorrectRequest = CorrectInput | DeprecatedCorrectInput;

export function isDeprecatedCorrectInput(
  input: CorrectRequest
): input is DeprecatedCorrectInput {
  return "corrections" in input;
}

/**
 * Execute a canonical correction unchanged or expand the deprecated map form
 * into deterministic, sequential, single-field requests.
 */
export async function executeCorrectRequest(
  input: CorrectRequest,
  send: (request: CorrectInput) => Promise<unknown>
): Promise<unknown | unknown[]> {
  if (!isDeprecatedCorrectInput(input)) {
    return send(input);
  }

  const fields = Object.keys(input.corrections).sort();
  if (fields.length === 0) {
    throw new TypeError("Deprecated correct() corrections must contain at least one field");
  }

  const { corrections, idempotency_key, ...shared } = input;
  const results: unknown[] = [];
  for (const field of fields) {
    results.push(
      await send({
        ...shared,
        field,
        value: corrections[field],
        idempotency_key: `${idempotency_key}:${field}`,
      })
    );
  }
  return results;
}
