import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

// This is a feature boundary, never authentication or per-row authorization.
// Admitted operations continue through the existing guarded dispatcher.
const LOCAL_OPERATIONS = new Set([
  "store",
  "correct",
  "retrieve_entities",
  "retrieve_entity_by_identifier",
  "retrieve_entity_snapshot",
  "list_observations",
  "retrieve_field_provenance",
  "list_timeline_events",
  "retrieve_related_entities",
  "create_relationship",
  "create_relationships",
  "list_relationships",
  "get_relationship_snapshot",
  "register_schema",
  "list_entity_types",
  "get_entity_type_counts",
  "list_relationship_types",
]);
const NETWORK_OPERATIONS = new Set([
  "sync_issues",
  "npm_check_update",
  "sync_entity_submissions",
  "retrieve_file_url",
]);
const FILE_PARAMETERS = [
  "file_path",
  "file_content",
  "mime_type",
  "file_idempotency_key",
  "original_filename",
];

function unavailable(errorCode: "FEATURE_UNAVAILABLE" | "NETWORK_DISABLED"): never {
  const message =
    errorCode === "NETWORK_DISABLED"
      ? "Network operations are disabled in this explicit runtime."
      : "This operation requires a feature not admitted by this explicit runtime.";
  throw new McpError(ErrorCode.InvalidRequest, message, { error_code: errorCode, message });
}

/** Internal default-deny boundary; adapters do not acquire capabilities by being present. */
export function assertEmbeddedOperationSupported(name: string, args: unknown): void {
  if (NETWORK_OPERATIONS.has(name)) unavailable("NETWORK_DISABLED");
  if (!LOCAL_OPERATIONS.has(name)) unavailable("FEATURE_UNAVAILABLE");
  if (name === "store" && args !== null && typeof args === "object") {
    const input = args as Record<string, unknown>;
    const intake = input.intake;
    if (
      input.source_storage === "reference" ||
      (intake !== null &&
        typeof intake === "object" &&
        (intake as Record<string, unknown>).mode === "overflow") ||
      FILE_PARAMETERS.some((key) => Object.hasOwn(input, key) && input[key] !== undefined)
    ) {
      unavailable("FEATURE_UNAVAILABLE");
    }
  }
}
