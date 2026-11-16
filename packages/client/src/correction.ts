import type { CorrectInput, DeprecatedCorrectInput } from "./types.js";

export type CorrectRequest = CorrectInput | DeprecatedCorrectInput;

export function isDeprecatedCorrectInput(input: CorrectRequest): input is DeprecatedCorrectInput {
  return "corrections" in input;
}

export function assertValidCorrectionIdempotencyBase(
  value: unknown,
  caller: string
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${caller} requires a non-empty idempotency key base`);
  }
}

function correctionEntityVersion(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const version = (result as Record<string, unknown>).entity_version;
  return typeof version === "string" && version.trim().length > 0 ? version : undefined;
}

export class SequentialCorrectionError extends Error {
  readonly failedField: string;
  readonly committedFields: string[];

  constructor(params: { failedField: string; committedFields: string[]; cause: unknown }) {
    const committed =
      params.committedFields.length > 0
        ? `Fields already committed: ${params.committedFields.join(", ")}.`
        : "No fields committed.";
    super(
      `Sequential correction failed at field "${params.failedField}". ${committed} ` +
        "Re-read the entity, then retry only the uncommitted fields with a fresh " +
        "idempotency key base, or use correct_transaction for an atomic multi-field update.",
      { cause: params.cause }
    );
    this.name = "SequentialCorrectionError";
    this.failedField = params.failedField;
    this.committedFields = [...params.committedFields];
  }
}

export async function executeSequentialCorrections(
  fields: string[],
  expectedVersion: string | undefined,
  send: (field: string, expectedVersion: string | undefined) => Promise<unknown>
): Promise<unknown[]> {
  const results: unknown[] = [];
  const committedFields: string[] = [];
  let nextExpectedVersion = expectedVersion;

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    let result: unknown;
    try {
      result = await send(field, nextExpectedVersion);
    } catch (cause) {
      throw new SequentialCorrectionError({
        failedField: field,
        committedFields,
        cause,
      });
    }

    results.push(result);
    committedFields.push(field);

    if (nextExpectedVersion !== undefined && index < fields.length - 1) {
      const returnedVersion = correctionEntityVersion(result);
      if (!returnedVersion) {
        throw new SequentialCorrectionError({
          failedField: fields[index + 1],
          committedFields,
          cause: new TypeError(
            `Correction response for field "${field}" omitted entity_version required for sequential compare-and-set`
          ),
        });
      }
      nextExpectedVersion = returnedVersion;
    }
  }

  return results;
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

  assertValidCorrectionIdempotencyBase(input.idempotency_key, "Deprecated correct()");

  const { corrections, idempotency_key, expected_version, overwrite, ...shared } = input;
  return executeSequentialCorrections(fields, expected_version, (field, chainedExpectedVersion) =>
    send({
      ...shared,
      field,
      value: corrections[field],
      idempotency_key: `${idempotency_key}:${field}`,
      ...(chainedExpectedVersion !== undefined ? { expected_version: chainedExpectedVersion } : {}),
      ...(overwrite !== undefined ? { overwrite } : {}),
    })
  );
}
