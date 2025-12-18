import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseKey,
);

export interface NeotomaRecord {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  file_urls: string[];
  external_source?: string | null;
  external_id?: string | null;
  external_hash?: string | null;
  embedding?: number[] | null;
  summary?: string | null;
  created_at: string;
  updated_at: string;
}

export async function initDatabase(): Promise<void> {
  // Run migrations before initializing database
  try {
    // Use dynamic import to avoid circular dependencies
    // @ts-expect-error - run_migrations.js is a JS file without type definitions
    const migrationModule = (await import("../scripts/run_migrations.js")) as {
      runMigrations?: (dryRun: boolean) => Promise<void>;
    };
    if (migrationModule.runMigrations) {
      await migrationModule.runMigrations(false);
    }
  } catch (error) {
    console.warn(
      `[WARN] Could not run migrations during init: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    // Continue anyway - migrations might already be applied or might fail due to permissions
  }

  try {
    const tablesToCheck = [
      { table: "records", columns: "id" },
      { table: "record_relationships", columns: "id" },
      { table: "plaid_items", columns: "id" },
      { table: "plaid_sync_runs", columns: "id" },
      { table: "external_connectors", columns: "id" },
      { table: "external_sync_runs", columns: "id" },
    ] as const;

    for (const { table, columns } of tablesToCheck) {
      const { error } = await supabase.from(table).select(columns).limit(1);
      if (error && error.code !== "PGRST116") {
        throw error;
      }
    }
  } catch (error) {
    console.error("Database connection failed:", error);
    throw error;
  }
}
