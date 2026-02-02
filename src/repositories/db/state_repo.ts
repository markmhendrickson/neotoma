/**
 * Database StateRepository implementation (FU-051)
 *
 * DB-based state repository using Supabase. For historical queries, uses event replay.
 */

import { supabase } from "../../db.js";
import { getRecordAtTimestamp } from "../../events/replay.js";
import type { StateRepository } from "../interfaces.js";
import type { NeotomaRecord } from "../../db.js";

export class DbStateRepository implements StateRepository {
  async getState(recordId: string): Promise<NeotomaRecord | null> {
    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("id", recordId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw new Error(
        `Failed to get state for record ${recordId}: ${error.message}`,
      );
    }

    return data as NeotomaRecord;
  }

  async getStateAtTimestamp(
    recordId: string,
    timestamp: string,
  ): Promise<NeotomaRecord | null> {
    // Use event replay for historical state
    return getRecordAtTimestamp(recordId, timestamp);
  }

  async saveState(record: NeotomaRecord): Promise<void> {
    // For materialized view strategy, this would refresh the view
    // For now, this is a no-op since we're using direct DB writes
    // This will be used when we convert to materialized view
    const { error } = await supabase
      .from("records")
      .upsert(record, { onConflict: "id" });

    if (error) {
      throw new Error(
        `Failed to save state for record ${record.id}: ${error.message}`,
      );
    }
  }

  async getStates(
    recordIds: string[],
  ): Promise<Map<string, NeotomaRecord | null>> {
    const { data, error } = await supabase
      .from("records")
      .select("*")
      .in("id", recordIds);

    if (error) {
      throw new Error(`Failed to get states: ${error.message}`);
    }

    const results = new Map<string, NeotomaRecord | null>();

    // Initialize all IDs as null
    for (const id of recordIds) {
      results.set(id, null);
    }

    // Set found records
    if (data) {
      for (const record of data) {
        results.set(record.id, record as NeotomaRecord);
      }
    }

    return results;
  }
}
