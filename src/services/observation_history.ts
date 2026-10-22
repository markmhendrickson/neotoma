import { ListObservationsRequestSchema } from "../shared/action_schemas.js";
import type { z } from "zod";
import type { ObservationRecord } from "./observation_storage.js";
import { OperationError } from "../core/operation_error.js";

export type ListObservationsInput = z.input<typeof ListObservationsRequestSchema>;
export interface ObservationHistoryPage {
  observations: ObservationRecord[];
  total: number;
  limit: number;
  offset: number;
}

/** Existing retained history-page semantics, shared by HTTP, MCP and internal reads. */
export async function listObservationHistoryForUser(
  userId: string,
  input: unknown
): Promise<ObservationHistoryPage> {
  const parsed = ListObservationsRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new OperationError("VALIDATION_INVALID_FORMAT", "Invalid observation-history request", {
      statusCode: 400,
      details: { issues: parsed.error.issues },
    });
  const { entity_id, limit, offset, updated_since, created_since } = parsed.data;
  try {
    // Deferred until execution inside the explicit scope; no connection opening,
    // initializer, optional SDK or transport runtime is imported by this service.
    const { createLocalDbClient } = await import("../repositories/sqlite/local_db_adapter.js");
    let query = createLocalDbClient()
      .from("observations")
      .select("*", { count: "exact" })
      .eq("entity_id", entity_id)
      .eq("user_id", userId);
    if (updated_since) query = query.gte("observed_at", updated_since);
    if (created_since) query = query.gte("observed_at", created_since);
    const { data, error, count } = await query
      .order("observed_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error)
      throw new OperationError("DB_QUERY_FAILED", "Failed to list observations", {
        statusCode: 500,
      });
    return { observations: (data ?? []) as ObservationRecord[], total: count ?? 0, limit, offset };
  } catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError("DB_QUERY_FAILED", "Failed to list observations", { statusCode: 500 });
  }
}
