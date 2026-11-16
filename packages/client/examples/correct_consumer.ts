/**
 * Compiled-consumer type example for the single-field correction contract.
 * Type-checked in CI by tests/integration/sdk_client_correct_types.test.ts
 * (part of `npm run test:contract-parity`). `@ts-expect-error` lines assert
 * that the previous map shapes are no longer accepted by the types.
 */
import {
  MultiFieldCorrectionError,
  NeotomaClient,
  type CorrectInput,
} from "../src/index.js";
import { snapshotOnUpdate } from "../src/helpers.js";

declare const client: NeotomaClient;

// Canonical payload: accepted.
const canonical: CorrectInput = {
  entity_id: "ent_example",
  entity_type: "task",
  field: "status",
  value: "done",
  idempotency_key: "caller-operation-key",
};
export const canonicalResult: Promise<unknown> = client.correct(canonical);

// Deprecated map overload (single entry at runtime): still typed, marked deprecated.
export const deprecatedResult: Promise<unknown> = client.correct({
  entity_id: "ent_example",
  entity_type: "task",
  corrections: { status: "done" },
  idempotency_key: "caller-operation-key",
});

// The old shape without entity_type and a caller key is rejected.
// @ts-expect-error entity_type, field, value and idempotency_key are required
void client.correct({ entity_id: "ent_example", corrections: { status: "done" } });

// A multi-field map is refused at runtime with a typed error.
export function isMultiFieldRefusal(error: unknown): error is MultiFieldCorrectionError {
  return error instanceof MultiFieldCorrectionError;
}

// snapshotOnUpdate requires entityType and a caller-supplied idempotencyKey.
export const helperResult = snapshotOnUpdate(client, {
  entityId: "ent_example",
  entityType: "task",
  corrections: { status: "done" },
  idempotencyKey: "caller-operation-key",
});

// @ts-expect-error entityType and idempotencyKey are required
void snapshotOnUpdate(client, { entityId: "ent_example", corrections: { status: "done" } });
