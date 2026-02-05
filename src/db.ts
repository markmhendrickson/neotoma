import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { createLocalSupabaseClient, LocalSupabaseClient } from "./repositories/sqlite/supabase_adapter.js";

const isLocalBackend = config.storageBackend === "local";

export const supabase: SupabaseClient | LocalSupabaseClient = isLocalBackend
  ? createLocalSupabaseClient()
  : createClient(config.supabaseUrl, config.supabaseKey);

export function getServiceRoleClient(): SupabaseClient | LocalSupabaseClient {
  if (isLocalBackend) {
    return createLocalSupabaseClient();
  }
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function initDatabase(): Promise<void> {
  // Run migrations before initializing database
  // Note: Migrations are skipped in MCP mode to avoid stdout pollution
  // Apply migrations manually via: npm run migrate
  const skipMigrations =
    isLocalBackend || process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART === "1";
  
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
    const tablesToCheck: Array<{
      table: string;
      columns: string;
      required: boolean;
    }> = [
      { table: "sources", columns: "id", required: true }, // Required - migration 20251231000001 creates it
      { table: "interpretations", columns: "id", required: true }, // Required - migration 20251231000003 creates it
    ];

    for (const { table, columns, required } of tablesToCheck) {
      const { error } = await supabase.from(table).select(columns).limit(1);
      if (error) {
        // PGRST116 = table not found, PGRST205 = table not in schema cache
        if (error.code === "PGRST116" || error.code === "PGRST205") {
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
