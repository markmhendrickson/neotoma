import {
  NeotomaClient,
  HttpTransport,
  LocalTransport,
  type CorrectInput,
  type LocalOperations,
} from "../../../packages/client/dist/index.js";
import { snapshotOnUpdate } from "../../../packages/client/dist/helpers.js";
const client = new NeotomaClient({ transport: "http" });
const input: CorrectInput = {
  entity_id: "ent_synthetic",
  entity_type: "task",
  field: "status",
  value: null,
  idempotency_key: "caller-owned-key",
  expected_version: "version",
  overwrite: false,
};
void client.correct(input);
void new HttpTransport().correct(input);
declare const operations: LocalOperations;
void new LocalTransport({ userId: "synthetic", operations }).correct(input);
void snapshotOnUpdate(client, {
  entityId: input.entity_id,
  entityType: input.entity_type,
  idempotencyKey: input.idempotency_key,
  corrections: { status: "done" },
  expectedVersion: "version",
  overwrite: false,
});
// @ts-expect-error The unsupported legacy map is no longer advertised as callable.
void client.correct({ entity_id: "ent_synthetic", corrections: { status: "done" } });
// @ts-expect-error Retry identity must be supplied by the caller.
void client.correct({
  entity_id: "ent_synthetic",
  entity_type: "task",
  field: "status",
  value: "done",
});
// @ts-expect-error Canonical HTTP contract requires the entity type.
void client.correct({
  entity_id: "ent_synthetic",
  field: "status",
  value: "done",
  idempotency_key: "caller",
});
// @ts-expect-error Helper requires caller-owned retry identity too.
void snapshotOnUpdate(client, {
  entityId: "ent_synthetic",
  entityType: "task",
  corrections: { status: "done" },
});
