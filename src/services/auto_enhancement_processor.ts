/**
 * Auto-Enhancement Processor
 *
 * Background processor that handles the auto_enhancement_queue table.
 * Processes queued fields for auto-enhancement in batches to avoid blocking storage operations.
 */

import { supabase } from "../db.js";
import { schemaRecommendationService } from "./schema_recommendation.js";
import { schemaRegistry } from "./schema_registry.js";
import { logger } from "../utils/logger.js";

export interface QueueItem {
  id: string;
  entity_type: string;
  fragment_key: string;
  user_id: string | null;
  frequency_count: number | null;
  retry_count: number;
}

/**
 * Process auto-enhancement queue (runs every 30 seconds)
 */
export async function processAutoEnhancementQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  const BATCH_SIZE = 10;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // 1. Get pending items (limit 10 per run)
    const { data: pendingItems, error: fetchError } = await supabase
      .from("auto_enhancement_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError || !pendingItems || pendingItems.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }

    logger.error(
      `[AUTO_ENHANCE_QUEUE] Processing ${pendingItems.length} items`,
    );

    // 2. Process each item
    for (const item of pendingItems as QueueItem[]) {
      processed++;

      try {
        // Mark as processing
        await supabase
          .from("auto_enhancement_queue")
          .update({ status: "processing" })
          .eq("id", item.id);

        // Check eligibility
        // Pass user_id as-is (could be UUID string or null)
        // The eligibility check will handle default UUID conversion
        const eligibility =
          await schemaRecommendationService.checkAutoEnhancementEligibility({
            entity_type: item.entity_type,
            fragment_key: item.fragment_key,
            user_id: item.user_id || undefined,
          });

        if (!eligibility.eligible) {
          // Mark as skipped
          await supabase
            .from("auto_enhancement_queue")
            .update({
              status: "skipped",
              processed_at: new Date().toISOString(),
              error_message: eligibility.reasoning,
            })
            .eq("id", item.id);

          skipped++;
          continue;
        }

        // Create recommendation record
        await schemaRecommendationService.autoEnhanceSchema({
          entity_type: item.entity_type,
          field_name: item.fragment_key,
          field_type: eligibility.inferred_type || "string",
          user_id: item.user_id || undefined,
          converter_suggestion: eligibility.converter_suggestion,
        });

        // Actually update the schema - handle both add_fields and add_converters
        if (eligibility.converter_suggestion) {
          // Add converter to existing field
          await schemaRegistry.updateSchemaIncremental({
            entity_type: item.entity_type,
            converters_to_add: [
              {
                field_name: item.fragment_key,
                converter: eligibility.converter_suggestion,
              },
            ],
            user_id: item.user_id || undefined,
            user_specific: !!item.user_id,
            activate: true, // Activate immediately so new data uses updated schema
            migrate_existing: true, // Migrate raw_fragments to observations for existing data
          });
        } else {
          // Add new field
          await schemaRegistry.updateSchemaIncremental({
            entity_type: item.entity_type,
            fields_to_add: [
              {
                field_name: item.fragment_key,
                field_type: eligibility.inferred_type || "string",
                required: false,
              },
            ],
            user_id: item.user_id || undefined,
            user_specific: !!item.user_id,
            activate: true, // Activate immediately so new data uses updated schema
            migrate_existing: true, // Migrate raw_fragments to observations for existing data
          });
        }

        // Mark as completed
        await supabase
          .from("auto_enhancement_queue")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            confidence_score: eligibility.confidence,
          })
          .eq("id", item.id);

        succeeded++;
        logger.error(
          `[AUTO_ENHANCE_QUEUE] Successfully enhanced ${item.entity_type}.${item.fragment_key} and updated schema`,
        );
      } catch (error: any) {
        failed++;
        logger.error(
          `[AUTO_ENHANCE_QUEUE] Failed to process item ${item.id}:`,
          error.message,
        );

        // Update retry count and mark as failed
        const retryCount = (item.retry_count || 0) + 1;
        const maxRetries = 3;

        await supabase
          .from("auto_enhancement_queue")
          .update({
            status: retryCount < maxRetries ? "failed" : "failed",
            retry_count: retryCount,
            last_retry_at: new Date().toISOString(),
            error_message: error.message,
          })
          .eq("id", item.id);
      }
    }

    logger.error(
      `[AUTO_ENHANCE_QUEUE] Processed: ${processed}, Succeeded: ${succeeded}, Failed: ${failed}, Skipped: ${skipped}`,
    );

    return { processed, succeeded, failed, skipped };
  } catch (error: any) {
    logger.error(
      `[AUTO_ENHANCE_QUEUE] Error processing queue:`,
      error.message,
    );
    return { processed, succeeded, failed, skipped };
  }
}

/**
 * Start the auto-enhancement processor (runs continuously)
 */
export function startAutoEnhancementProcessor(intervalMs: number = 30000) {
  logger.info(
    `[AUTO_ENHANCE_QUEUE] Starting processor (interval: ${intervalMs}ms)`,
  );

  const processInterval = setInterval(async () => {
    try {
      await processAutoEnhancementQueue();
    } catch (error: any) {
      logger.error(
        `[AUTO_ENHANCE_QUEUE] Processor error:`,
        error.message,
      );
    }
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(processInterval);
    logger.error(`[AUTO_ENHANCE_QUEUE] Processor stopped`);
  };
}

/**
 * Clean up old completed/skipped queue items (run periodically)
 */
export async function cleanupOldQueueItems(
  daysToKeep: number = 7,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const { data, error } = await supabase
    .from("auto_enhancement_queue")
    .delete()
    .in("status", ["completed", "skipped"])
    .lt("processed_at", cutoffDate.toISOString())
    .select("id");

  if (error) {
    logger.error(`[AUTO_ENHANCE_QUEUE] Cleanup error:`, error.message);
    return 0;
  }

  const deletedCount = data?.length || 0;
  logger.error(
    `[AUTO_ENHANCE_QUEUE] Cleaned up ${deletedCount} old queue items`,
  );
  return deletedCount;
}
