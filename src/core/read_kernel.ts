import type { EmbeddedRuntimeContext } from "./runtime_context.js";
import type {
  ListObservationsInput,
  ObservationHistoryPage,
} from "../services/observation_history.js";
import type { FieldProvenanceResponse } from "../services/field_provenance.js";
import type { z } from "zod";
import type { FieldProvenanceRequestSchema } from "../shared/action_schemas.js";
import type { PrivateEntityListResult } from "../shared/action_handlers/entity_handlers.js";
import type { RetrieveEntitiesRequestSchema } from "../shared/action_schemas.js";
import { OperationError } from "./operation_error.js";

type PlainOptions = Partial<
  Omit<
    z.output<typeof RetrieveEntitiesRequestSchema>,
    "search" | "similarity_threshold" | "collapse_by" | "exclude_bookkeeping" | "user_id"
  >
>;
export type PrivateEntityListInput = PlainOptions &
  ({ entity_type: string } | { entity_types: [string, ...string[]] });

export type FieldProvenanceInput = z.input<typeof FieldProvenanceRequestSchema>;
export type InternalReadResult =
  | ObservationHistoryPage
  | FieldProvenanceResponse
  | PrivateEntityListResult;

const CONVERTED_READS = {
  async retrieve_entities(userId: string, input: unknown) {
    const { queryPlainEntitiesForUser } =
      await import("../shared/action_handlers/entity_handlers.js");
    return queryPlainEntitiesForUser(userId, input);
  },
  async list_observations(userId: string, input: unknown) {
    const { listObservationHistoryForUser } = await import("../services/observation_history.js");
    return listObservationHistoryForUser(userId, input);
  },
  async retrieve_field_provenance(userId: string, input: unknown) {
    const { FieldProvenanceRequestSchema } = await import("../shared/action_schemas.js");
    const parsed = FieldProvenanceRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new OperationError("VALIDATION_INVALID_FORMAT", "Invalid field-provenance request", {
        statusCode: 400,
        details: { issues: parsed.error.issues },
      });
    const { getFieldProvenance } = await import("../services/field_provenance.js");
    return getFieldProvenance(parsed.data.entity_id, parsed.data.field, userId);
  },
};

export interface InternalReadKernel {
  retrieveEntities(input: PrivateEntityListInput): Promise<PrivateEntityListResult>;
  listObservations(input: ListObservationsInput): Promise<ObservationHistoryPage>;
  retrieveFieldProvenance(input: FieldProvenanceInput): Promise<FieldProvenanceResponse>;
  execute(operation: "retrieve_entities", input: unknown): Promise<PrivateEntityListResult>;
  execute(operation: "list_observations", input: unknown): Promise<ObservationHistoryPage>;
  execute(operation: "retrieve_field_provenance", input: unknown): Promise<FieldProvenanceResponse>;
  execute(operation: string, input: unknown): Promise<InternalReadResult>;
  dispose(): Promise<void>;
}
const NETWORK_OPERATIONS = new Set([
  "npm_check_update",
  "retrieve_file_url",
  "sync_issues",
  "sync_entity_submissions",
]);

/** Internal, bounded converted closure. Borrows the runtime and never falls back to a transport. */
export function createInternalReadKernel(options: {
  userId: string;
  runtime: EmbeddedRuntimeContext;
}): InternalReadKernel {
  if (typeof options.userId !== "string" || !options.userId.trim())
    throw new OperationError(
      "VALIDATION_INVALID_FORMAT",
      "A trusted local user binding is required",
      { statusCode: 400 }
    );
  const userId = options.userId;
  const runtime = options.runtime;
  let closing = false;
  let disposal: Promise<void> | undefined;
  const active = new Set<Promise<unknown>>();
  function execute(
    operation: "retrieve_entities",
    input: unknown
  ): Promise<PrivateEntityListResult>;
  function execute(operation: "list_observations", input: unknown): Promise<ObservationHistoryPage>;
  function execute(
    operation: "retrieve_field_provenance",
    input: unknown
  ): Promise<FieldProvenanceResponse>;
  function execute(operation: string, input: unknown): Promise<InternalReadResult>;
  function execute(operation: string, input: unknown): Promise<InternalReadResult> {
    if (closing)
      return Promise.reject(
        new OperationError("FEATURE_UNAVAILABLE", "This read kernel has been disposed", {
          statusCode: 400,
          details: { hint: "Create a new kernel with an open runtime." },
        })
      );
    const code = NETWORK_OPERATIONS.has(operation) ? "NETWORK_DISABLED" : "FEATURE_UNAVAILABLE";
    if (!Object.hasOwn(CONVERTED_READS, operation))
      return Promise.reject(
        new OperationError(code, "This operation is not available in the internal read kernel", {
          statusCode: 400,
          details: {
            hint: "Use only converted typed plain retrieve_entities, list_observations or retrieve_field_provenance operations; other operations remain unavailable.",
          },
        })
      );
    const handler = CONVERTED_READS[operation as keyof typeof CONVERTED_READS];
    const pending = runtime.run<InternalReadResult>(() => handler(userId, input));
    active.add(pending);
    void pending.then(
      () => active.delete(pending),
      () => active.delete(pending)
    );
    return pending;
  }
  return {
    retrieveEntities(input) {
      return execute("retrieve_entities", input);
    },
    listObservations(input) {
      return execute("list_observations", input);
    },
    retrieveFieldProvenance(input) {
      return execute("retrieve_field_provenance", input);
    },
    execute,
    dispose() {
      closing = true;
      disposal ??= Promise.allSettled([...active]).then(() => undefined);
      return disposal;
    },
  };
}
