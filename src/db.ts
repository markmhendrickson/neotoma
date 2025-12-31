import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

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
  // Note: Migrations are skipped in MCP mode to avoid stdout pollution
  // Apply migrations manually via: npm run migrate
  const skipMigrations = process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART === "1";
  
  if (!skipMigrations) {
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
      logger.warn(
        `[WARN] Could not run migrations during init: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Continue anyway - migrations might already be applied or might fail due to permissions
    }
  }

  try {
    const tablesToCheck = [
      { table: "records", columns: "id", required: true }, // Required - migration 20251231000011 creates it
      { table: "record_relationships", columns: "id", required: true }, // Required - migration 20251231000010 creates it
      { table: "plaid_items", columns: "id", required: true }, // Required - migration 20251231000012 creates it
      { table: "plaid_sync_runs", columns: "id", required: true }, // Required - migration 20251231000012 creates it
      { table: "external_connectors", columns: "id", required: true }, // Required - migration 20251231000013 creates it
      { table: "external_sync_runs", columns: "id", required: true }, // Required - migration 20251231000013 creates it
    ] as const;

    for (const { table, columns, required } of tablesToCheck) {
      const { error } = await supabase.from(table).select(columns).limit(1);
      if (error) {
        // PGRST116 = table not found
        if (error.code === "PGRST116") {
          if (!required) {
            // Table doesn't exist but it's optional - skip
            continue;
          }
          // Table is required but doesn't exist - throw
          throw error;
        }
        // Other error codes - always throw
        throw error;
      }
    }
  } catch (error) {
    logger.error("Database connection failed:", error);
    throw error;
  }
}
