import type { EmbeddedRuntimeContext } from "./runtime_context.js";
import type {
  ListObservationsInput,
  ObservationHistoryPage,
} from "../services/observation_history.js";
import { OperationError } from "./operation_error.js";

export interface InternalReadKernel {
  listObservations(input: ListObservationsInput): Promise<ObservationHistoryPage>;
  execute(operation: string, input: unknown): Promise<ObservationHistoryPage>;
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
  function execute(operation: string, input: unknown): Promise<ObservationHistoryPage> {
    if (closing)
      return Promise.reject(
        new OperationError("FEATURE_UNAVAILABLE", "This read kernel has been disposed", {
          statusCode: 400,
          details: { hint: "Create a new kernel with an open runtime." },
        })
      );
    const code = NETWORK_OPERATIONS.has(operation) ? "NETWORK_DISABLED" : "FEATURE_UNAVAILABLE";
    if (operation !== "list_observations")
      return Promise.reject(
        new OperationError(code, "This operation is not available in the internal read kernel", {
          statusCode: 400,
          details: {
            hint: "Use only the converted list_observations operation; other operations remain unavailable.",
          },
        })
      );
    const pending = runtime.run(async () => {
      const { listObservationHistoryForUser } = await import("../services/observation_history.js");
      return listObservationHistoryForUser(userId, input);
    });
    active.add(pending);
    void pending.then(
      () => active.delete(pending),
      () => active.delete(pending)
    );
    return pending;
  }
  return {
    listObservations(input) {
      return execute("list_observations", input);
    },
    execute,
    dispose() {
      closing = true;
      disposal ??= Promise.allSettled([...active]).then(() => undefined);
      return disposal;
    },
  };
}
